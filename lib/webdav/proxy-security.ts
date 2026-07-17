import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { Agent, type Dispatcher } from 'undici';
import { configManager } from '@/lib/admin/config-manager';
import { parseJmapServers, resolveTrustedJmapUrl } from '@/lib/admin/jmap-servers';
import {
  isBlockedHttpHostname,
  isBlockedIpAddress,
  normalizeHttpHostname,
} from '@/lib/security/url-guard';

export const WEBDAV_MAX_PATH_BYTES = 4 * 1024;
export const WEBDAV_MAX_PROPFIND_REQUEST_BYTES = 64 * 1024;
export const WEBDAV_MAX_PROPFIND_RESPONSE_BYTES = 4 * 1024 * 1024;
export const WEBDAV_MAX_FILE_BYTES = 100 * 1024 * 1024;
export const WEBDAV_DNS_TIMEOUT_MS = 5_000;
export const WEBDAV_REQUEST_TIMEOUT_MS = 60_000;
export const WEBDAV_MAX_CONCURRENT_REQUESTS = 16;

export class WebDavProxyError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = 'WebDavProxyError';
  }
}

export interface WebDavUpstream {
  baseUrl: string;
  dispatcher: Dispatcher;
}

const encoder = new TextEncoder();

function proxyError(code: string, status: number, message: string): WebDavProxyError {
  return new WebDavProxyError(code, status, message);
}

function parseServerUrl(serverUrl: string): URL {
  let url: URL;
  try {
    url = new URL(serverUrl);
  } catch {
    throw proxyError('target_invalid', 403, 'WebDAV server is not allowed');
  }

  if ((url.protocol !== 'https:' && url.protocol !== 'http:')
    || url.username
    || url.password
    || url.search
    || url.hash) {
    throw proxyError('target_invalid', 403, 'WebDAV server is not allowed');
  }

  return url;
}

async function resolveAddresses(url: URL, allowPrivate: boolean): Promise<LookupAddress[]> {
  const hostname = normalizeHttpHostname(url.hostname);
  if (!allowPrivate && isBlockedHttpHostname(hostname)) {
    throw proxyError('target_private', 403, 'WebDAV server is not allowed');
  }

  const literalFamily = isIP(hostname);
  let addresses: LookupAddress[];
  try {
    if (literalFamily) {
      addresses = [{ address: hostname, family: literalFamily }];
    } else {
      let dnsTimeout: ReturnType<typeof setTimeout> | null = null;
      try {
        addresses = await Promise.race([
          lookup(hostname, { all: true, verbatim: true }),
          new Promise<never>((_resolve, reject) => {
            dnsTimeout = setTimeout(
              () => reject(proxyError('target_dns_timeout', 502, 'WebDAV server is unavailable')),
              WEBDAV_DNS_TIMEOUT_MS,
            );
          }),
        ]);
      } finally {
        if (dnsTimeout) clearTimeout(dnsTimeout);
      }
    }
  } catch (error) {
    if (error instanceof WebDavProxyError) throw error;
    throw proxyError('target_dns_failed', 502, 'WebDAV server is unavailable');
  }

  if (addresses.length === 0) {
    throw proxyError('target_dns_empty', 502, 'WebDAV server is unavailable');
  }
  if (!allowPrivate && addresses.some((record) => isBlockedIpAddress(record.address))) {
    throw proxyError('target_private', 403, 'WebDAV server is not allowed');
  }

  return addresses;
}

function createPinnedDispatcher(hostname: string, addresses: LookupAddress[]): Dispatcher {
  const normalizedHostname = normalizeHttpHostname(hostname);
  const pinnedLookup: LookupFunction = (requestedHostname, options, callback) => {
    if (normalizeHttpHostname(requestedHostname) !== normalizedHostname) {
      const error = new Error('WebDAV DNS pin mismatch') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      callback(error, '', 0);
      return;
    }

    const requestedFamily = options.family === 'IPv4'
      ? 4
      : options.family === 'IPv6'
        ? 6
        : options.family;
    const candidates = requestedFamily
      ? addresses.filter((record) => record.family === requestedFamily)
      : addresses;
    if (candidates.length === 0) {
      const error = new Error('No pinned WebDAV address for requested family') as NodeJS.ErrnoException;
      error.code = 'EAI_ADDRFAMILY';
      callback(error, '', 0);
      return;
    }

    if (options.all) {
      callback(null, candidates);
    } else {
      callback(null, candidates[0].address, candidates[0].family);
    }
  };

  return new Agent({
    connect: { lookup: pinnedLookup },
    connections: 2,
    pipelining: 1,
  });
}

/**
 * Resolve the cookie-derived server against operator configuration. Configured
 * JMAP servers are explicit trust anchors and may intentionally be private or
 * use HTTP. Custom endpoints remain opt-in and must be public HTTPS. DNS
 * answers are pinned into a request-scoped dispatcher to close the rebinding
 * window between validation and socket connection.
 */
export async function resolveWebDavUpstream(serverUrl: string): Promise<WebDavUpstream> {
  await configManager.ensureLoaded();
  const configuredServerUrl = configManager.get<string>('jmapServerUrl', '');
  const configuredServers = parseJmapServers(configManager.get<unknown>('jmapServers', []));
  const trustedUrl = resolveTrustedJmapUrl(serverUrl, configuredServerUrl, configuredServers);
  const allowCustomEndpoint = configManager.get<boolean>('allowCustomJmapEndpoint', false);

  if (!trustedUrl && !allowCustomEndpoint) {
    throw proxyError('target_unconfigured', 403, 'WebDAV server is not allowed');
  }

  const url = parseServerUrl(trustedUrl ?? serverUrl);
  const isTrusted = trustedUrl !== null;
  if (!isTrusted && url.protocol !== 'https:') {
    throw proxyError('target_insecure', 403, 'WebDAV server is not allowed');
  }

  const addresses = await resolveAddresses(url, isTrusted);
  return {
    baseUrl: url.toString().replace(/\/+$/, ''),
    dispatcher: createPinnedDispatcher(url.hostname, addresses),
  };
}

export function assertSameOriginWebDavRequest(request: {
  headers: Pick<Headers, 'get'>;
  nextUrl: { origin: string };
}): void {
  if (request.headers.get('sec-fetch-site') !== 'same-origin'
    || request.headers.get('sec-fetch-mode') !== 'cors'
    || request.headers.get('sec-fetch-dest') !== 'empty') {
    throw proxyError('cross_site_request', 403, 'Cross-site WebDAV requests are not allowed');
  }

  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    throw proxyError('origin_mismatch', 403, 'Cross-site WebDAV requests are not allowed');
  }
}

export function normalizeDavRelativePath(rawPath: string): string {
  const hasControlCharacter = Array.from(rawPath).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (encoder.encode(rawPath).byteLength > WEBDAV_MAX_PATH_BYTES
    || hasControlCharacter
    || rawPath.includes('?')
    || rawPath.includes('#')) {
    throw proxyError('path_invalid', 400, 'Invalid WebDAV path');
  }

  const sanitized = rawPath.replace(/\\/g, '/');
  const segments = sanitized.split('/').filter(Boolean);
  if (segments.length > 128) {
    throw proxyError('path_invalid', 400, 'Invalid WebDAV path');
  }

  return segments.map((segment) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw proxyError('path_encoding', 400, 'Invalid WebDAV path encoding');
    }

    if (decoded === '.'
      || decoded === '..'
      || decoded.includes('/')
      || decoded.includes('\\')
      || decoded.includes('\0')
      || encoder.encode(decoded).byteLength > 255) {
      throw proxyError('path_segment', 400, 'Invalid WebDAV path segment');
    }
    return encodeURIComponent(decoded.normalize('NFC'));
  }).join('/');
}

export function buildDavTargetUrl(baseUrl: string, username: string, rawPath: string): string {
  const rootUrl = new URL(`${baseUrl.replace(/\/+$/, '')}/dav/file/${encodeURIComponent(username)}/`);
  const relativePath = normalizeDavRelativePath(rawPath);
  return relativePath ? new URL(relativePath, rootUrl).toString() : rootUrl.toString();
}

export function assertContentLength(headers: Pick<Headers, 'get'>, maximum: number): void {
  const raw = headers.get('content-length');
  if (raw === null) return;
  if (!/^\d+$/.test(raw) || Number(raw) > maximum) {
    throw proxyError('request_too_large', 413, 'WebDAV request is too large');
  }
}

export async function readStreamWithLimit(
  stream: ReadableStream<Uint8Array> | null,
  maximum: number,
  code = 'response_too_large',
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        throw proxyError(
          code,
          code === 'request_too_large' ? 413 : 502,
          code === 'request_too_large' ? 'WebDAV request is too large' : 'WebDAV response is too large',
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function boundedReadableStream(
  source: ReadableStream<Uint8Array>,
  maximum: number,
  code: 'request_too_large' | 'response_too_large',
  onDone?: () => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let total = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          finish();
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > maximum) {
          await reader.cancel();
          finish();
          controller.error(proxyError(
            code,
            code === 'request_too_large' ? 413 : 502,
            code === 'request_too_large' ? 'WebDAV request is too large' : 'WebDAV response is too large',
          ));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        finish();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        finish();
      }
    },
  });
}

const concurrencyStateKey = Symbol.for('nfmail.webdav.proxyConcurrency');
type ConcurrencyState = { active: number };
const concurrencyGlobal = globalThis as typeof globalThis & {
  [concurrencyStateKey]?: ConcurrencyState;
};
const concurrencyState = concurrencyGlobal[concurrencyStateKey]
  ?? (concurrencyGlobal[concurrencyStateKey] = { active: 0 });

export function acquireWebDavRequestSlot(): () => void {
  if (concurrencyState.active >= WEBDAV_MAX_CONCURRENT_REQUESTS) {
    throw proxyError('concurrency_limit', 429, 'WebDAV proxy is busy');
  }
  concurrencyState.active += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    concurrencyState.active = Math.max(0, concurrencyState.active - 1);
  };
}

export function findWebDavProxyError(error: unknown): WebDavProxyError | null {
  const visited = new Set<unknown>();
  let current = error;
  while (current && !visited.has(current)) {
    if (current instanceof WebDavProxyError) return current;
    visited.add(current);
    current = typeof current === 'object' && 'cause' in current
      ? (current as { cause?: unknown }).cause
      : null;
  }
  return null;
}
