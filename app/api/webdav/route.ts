import { NextRequest, NextResponse } from 'next/server';
import type { Dispatcher } from 'undici';
import { logger } from '@/lib/logger';
import { getStalwartCredentials } from '@/lib/stalwart/credentials';
import {
  WEBDAV_MAX_FILE_BYTES,
  WEBDAV_MAX_PROPFIND_REQUEST_BYTES,
  WEBDAV_MAX_PROPFIND_RESPONSE_BYTES,
  WEBDAV_REQUEST_TIMEOUT_MS,
  WebDavProxyError,
  acquireWebDavRequestSlot,
  assertContentLength,
  assertSameOriginWebDavRequest,
  boundedReadableStream,
  buildDavTargetUrl,
  findWebDavProxyError,
  normalizeDavRelativePath,
  readStreamWithLimit,
  resolveWebDavUpstream,
} from '@/lib/webdav/proxy-security';

const ALLOWED_METHODS = new Set(['PROPFIND', 'MKCOL', 'GET', 'PUT', 'DELETE', 'MOVE', 'COPY']);
const BODY_METHODS = new Set(['PROPFIND', 'PUT']);
const DESTINATION_METHODS = new Set(['MOVE', 'COPY']);

type PinnedFetchInit = RequestInit & {
  dispatcher: Dispatcher;
  duplex?: 'half';
};

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function validatedHeader(
  request: NextRequest,
  name: string,
  maximumLength = 255,
): string | null {
  const value = request.headers.get(name);
  if (value === null) return null;
  if (value.length > maximumLength || /[\0\r\n]/.test(value)) {
    throw new WebDavProxyError('header_invalid', 400, `Invalid ${name} header`);
  }
  return value;
}

function assertResponseLength(response: Response, maximum: number): void {
  const raw = response.headers.get('content-length');
  if (raw !== null && (!/^\d+$/.test(raw) || Number(raw) > maximum)) {
    throw new WebDavProxyError('response_too_large', 502, 'WebDAV response is too large');
  }
}

function getUpstreamHeaders(
  request: NextRequest,
  method: string,
  baseUrl: string,
  username: string,
): Record<string, string> {
  const headers: Record<string, string> = {};
  const depth = validatedHeader(request, 'Depth', 8);
  const contentType = validatedHeader(request, 'Content-Type');
  const destination = validatedHeader(request, 'X-WebDAV-Destination', 4096);
  const overwrite = validatedHeader(request, 'Overwrite', 1);

  if (method === 'PROPFIND') {
    if (depth !== null && depth !== '0' && depth !== '1') {
      throw new WebDavProxyError('depth_invalid', 400, 'Invalid Depth header');
    }
    // RFC 4918 otherwise permits an unbounded default Depth. A missing browser
    // header is deliberately reduced to the target resource only.
    headers.Depth = depth ?? '0';
  } else if (depth !== null) {
    throw new WebDavProxyError('depth_invalid', 400, 'Invalid Depth header');
  }

  if (contentType) headers['Content-Type'] = contentType;

  if (DESTINATION_METHODS.has(method)) {
    if (!destination) {
      throw new WebDavProxyError('destination_missing', 400, 'Missing WebDAV destination');
    }
    headers.Destination = buildDavTargetUrl(baseUrl, username, destination);
    if (overwrite !== null && overwrite !== 'T' && overwrite !== 'F') {
      throw new WebDavProxyError('overwrite_invalid', 400, 'Invalid Overwrite header');
    }
    headers.Overwrite = overwrite ?? 'F';
  } else if (destination !== null || overwrite !== null) {
    throw new WebDavProxyError('destination_invalid', 400, 'Unexpected WebDAV destination headers');
  }

  return headers;
}

/**
 * Server-side WebDAV bridge. The browser supplies only an account-relative
 * path and operation; credentials and the configured upstream origin remain
 * server-side.
 */
export async function POST(request: NextRequest) {
  let method = 'UNKNOWN';
  let releaseSlot: (() => void) | null = null;
  let dispatcher: Dispatcher | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  let detachClientAbort: (() => void) | null = null;
  const controller = new AbortController();
  let cleanedUp = false;

  const cleanup = (abort = false) => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (timeout) clearTimeout(timeout);
    detachClientAbort?.();
    if (abort && !controller.signal.aborted) controller.abort();
    releaseSlot?.();
    if (dispatcher) void dispatcher.close().catch(() => undefined);
  };

  try {
    assertSameOriginWebDavRequest(request);

    const creds = await getStalwartCredentials(request);
    if (!creds) return jsonError('Not authenticated', 401);

    method = request.headers.get('X-WebDAV-Method')?.toUpperCase() ?? '';
    if (!ALLOWED_METHODS.has(method)) {
      return jsonError('Invalid WebDAV method', 400);
    }

    const davPath = request.headers.get('X-WebDAV-Path') ?? '/';
    const normalizedPath = normalizeDavRelativePath(davPath);

    if (method === 'PROPFIND') {
      assertContentLength(request.headers, WEBDAV_MAX_PROPFIND_REQUEST_BYTES);
    } else if (method === 'PUT') {
      assertContentLength(request.headers, WEBDAV_MAX_FILE_BYTES);
    } else if (request.body && BODY_METHODS.has(method) === false) {
      const rawLength = request.headers.get('content-length');
      if (rawLength !== null && rawLength !== '0') {
        throw new WebDavProxyError('body_invalid', 400, 'Unexpected WebDAV request body');
      }
    }

    releaseSlot = acquireWebDavRequestSlot();
    const upstream = await resolveWebDavUpstream(creds.serverUrl);
    dispatcher = upstream.dispatcher;

    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      cleanup();
    }, WEBDAV_REQUEST_TIMEOUT_MS);

    const requestSignal = request.signal;
    const abortFromClient = () => {
      controller.abort(requestSignal.reason);
      cleanup();
    };
    requestSignal?.addEventListener('abort', abortFromClient, { once: true });
    detachClientAbort = () => requestSignal?.removeEventListener('abort', abortFromClient);

    const targetUrl = buildDavTargetUrl(upstream.baseUrl, creds.username, normalizedPath);
    const upstreamHeaders = {
      Authorization: creds.authHeader,
      ...getUpstreamHeaders(request, method, upstream.baseUrl, creds.username),
    };

    let body: BodyInit | null = null;
    if (method === 'PROPFIND') {
      const propfindBody = await readStreamWithLimit(
        request.body,
        WEBDAV_MAX_PROPFIND_REQUEST_BYTES,
        'request_too_large',
      );
      body = propfindBody.buffer as ArrayBuffer;
    } else if (method === 'PUT' && request.body) {
      body = boundedReadableStream(
        request.body,
        WEBDAV_MAX_FILE_BYTES,
        'request_too_large',
      );
    }

    const response = await fetch(targetUrl, {
      method,
      headers: upstreamHeaders,
      body,
      redirect: 'manual',
      signal: controller.signal,
      dispatcher,
      ...(method === 'PUT' ? { duplex: 'half' } : {}),
    } as PinnedFetchInit);

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new WebDavProxyError('redirect_denied', 502, 'WebDAV server redirect was denied');
    }

    const responseHeaders = new Headers({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });

    if (method === 'GET') {
      assertResponseLength(response, WEBDAV_MAX_FILE_BYTES);
      const contentType = response.headers.get('Content-Type');
      const contentLength = response.headers.get('Content-Length');
      if (contentType) responseHeaders.set('Content-Type', contentType);
      if (contentLength) responseHeaders.set('Content-Length', contentLength);

      if (!response.body) {
        cleanup();
        return new NextResponse(null, { status: response.status, headers: responseHeaders });
      }

      const bodyStream = boundedReadableStream(
        response.body,
        WEBDAV_MAX_FILE_BYTES,
        'response_too_large',
        cleanup,
      );
      return new NextResponse(bodyStream, { status: response.status, headers: responseHeaders });
    }

    if (method === 'PROPFIND') {
      assertResponseLength(response, WEBDAV_MAX_PROPFIND_RESPONSE_BYTES);
      const xml = await readStreamWithLimit(response.body, WEBDAV_MAX_PROPFIND_RESPONSE_BYTES);
      responseHeaders.set('Content-Type', 'application/xml; charset=utf-8');
      responseHeaders.set('X-WebDAV-Request-Path', normalizedPath ? `/${normalizedPath}` : '/');
      cleanup();
      return new NextResponse(xml.buffer as ArrayBuffer, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    await response.body?.cancel();
    cleanup();
    return new NextResponse(null, { status: response.status, headers: responseHeaders });
  } catch (error) {
    cleanup(true);
    const proxyFailure = findWebDavProxyError(error);
    if (proxyFailure) {
      if (proxyFailure.status >= 500) {
        logger.error('WebDAV proxy request failed', {
          code: proxyFailure.code,
          method,
        });
      }
      return jsonError(proxyFailure.publicMessage, proxyFailure.status);
    }
    if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
      logger.error('WebDAV proxy request failed', { code: 'timeout', method });
      return jsonError('WebDAV server timed out', 504);
    }

    logger.error('WebDAV proxy request failed', { code: 'upstream_failure', method });
    return jsonError('WebDAV proxy request failed', 502);
  }
}
