/**
 * WebDAV client that proxies through /api/webdav to avoid CORS issues.
 * The server-side proxy handles auth and forwards requests to Stalwart's /dav/file/ endpoint.
 */

import { getActiveAccountSlotHeaders } from '@/lib/auth/active-account-slot';
import { apiFetch, withBasePath } from '@/lib/browser-navigation';

export interface WebDAVResource {
  /** Account-relative, percent-encoded path safe to send back to the proxy. */
  path: string;
  /** @deprecated Use path. Kept temporarily for the legacy WebDAV store. */
  href: string;
  name: string;
  isDirectory: boolean;
  contentType: string;
  contentLength: number;
  lastModified: string;
  etag: string;
}

export type WebDAVClientErrorCode = 'http' | 'invalid-response' | 'network';

export class WebDAVClientError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly code: WebDAVClientErrorCode = 'http',
  ) {
    super(`WebDAV ${method} failed.`);
    this.name = 'WebDAVClientError';
  }
}

function abortError(signal?: AbortSignal): DOMException | null {
  if (!signal?.aborted) return null;
  return new DOMException('WebDAV request aborted', 'AbortError');
}

function canonicalDavPath(path: string): string {
  if (path.includes('?') || path.includes('#') || path.includes('\\')) {
    throw new WebDAVClientError('PATH', 400, 'invalid-response');
  }

  const encodedSegments = path.split('/').filter(Boolean).map((segment) => {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // Treat a literal or malformed percent sign as filename data. The proxy
      // receives a canonical encoding and never has to guess.
    }
    if (decoded === '.'
      || decoded === '..'
      || decoded.includes('/')
      || decoded.includes('\\')
      || decoded.includes('\0')) {
      throw new WebDAVClientError('PATH', 400, 'invalid-response');
    }
    return encodeURIComponent(decoded.normalize('NFC'));
  });

  return encodedSegments.length > 0 ? `/${encodedSegments.join('/')}` : '/';
}

function joinDavPath(parentPath: string, encodedSegment: string): string {
  return parentPath === '/' ? `/${encodedSegment}` : `${parentPath}/${encodedSegment}`;
}

export class WebDAVClient {
  private proxyUrl = '/api/webdav';

  constructor(private readonly accountSlot?: number | null) {}

  private getAccountHeaders(): Record<string, string> {
    if (this.accountSlot === undefined) return getActiveAccountSlotHeaders();
    return this.accountSlot === null
      ? {}
      : { 'X-JMAP-Cookie-Slot': String(this.accountSlot) };
  }

  /**
   * Send a WebDAV request through the proxy.
   */
  private async request(method: string, path: string, options?: {
    headers?: Record<string, string>;
    body?: string | ArrayBuffer | Blob;
    signal?: AbortSignal;
  }): Promise<Response> {
    const aborted = abortError(options?.signal);
    if (aborted) throw aborted;
    const headers: Record<string, string> = {
      'X-WebDAV-Method': method,
      'X-WebDAV-Path': canonicalDavPath(path),
      ...this.getAccountHeaders(),
      ...options?.headers,
    };

    try {
      return await apiFetch(this.proxyUrl, {
        method: 'POST',
        headers,
        body: options?.body,
        signal: options?.signal,
      });
    } catch (error) {
      const requestAborted = abortError(options?.signal);
      if (requestAborted) throw requestAborted;
      if (
        (error instanceof DOMException && error.name === 'AbortError')
        || (error instanceof Error && error.name === 'AbortError')
      ) {
        throw error;
      }
      throw new WebDAVClientError(method, 0, 'network');
    }
  }

  /**
   * Check if WebDAV is available by sending a PROPFIND to the root.
   */
  async checkSupport(signal?: AbortSignal): Promise<boolean> {
    const response = await this.request('PROPFIND', '/', {
      headers: {
        'Depth': '0',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
  </D:prop>
</D:propfind>`,
      signal,
    });
    if (response.status === 207) return true;
    if (response.status === 404 || response.status === 405 || response.status === 501) {
      return false;
    }
    throw new WebDAVClientError('PROPFIND', response.status);
  }

  private async propfind(
    path: string,
    depth: '0' | '1',
    signal?: AbortSignal,
  ): Promise<WebDAVResource[]> {
    const response = await this.request('PROPFIND', path, {
      headers: {
        'Depth': depth,
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:getcontenttype/>
    <D:getcontentlength/>
    <D:getlastmodified/>
    <D:getetag/>
    <D:displayname/>
  </D:prop>
</D:propfind>`,
      signal,
    });

    if (response.status !== 207) {
      throw new WebDAVClientError('PROPFIND', response.status);
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      const requestAborted = abortError(signal);
      if (requestAborted) throw requestAborted;
      if (
        (error instanceof DOMException && error.name === 'AbortError')
        || (error instanceof Error && error.name === 'AbortError')
      ) {
        throw error;
      }
      throw new WebDAVClientError('PROPFIND', 0, 'network');
    }
    const aborted = abortError(signal);
    if (aborted) throw aborted;
    const requestPath = response.headers.get('X-WebDAV-Request-Path') || path;
    return this.parseMultistatus(text, requestPath, depth === '0');
  }

  /**
   * List contents of a directory via PROPFIND with Depth: 1.
   */
  async list(path: string = '/', signal?: AbortSignal): Promise<WebDAVResource[]> {
    return this.propfind(path, '1', signal);
  }

  /**
   * Read metadata for exactly one resource via PROPFIND with Depth: 0.
   */
  async stat(path: string, signal?: AbortSignal): Promise<WebDAVResource> {
    const resources = await this.propfind(path, '0', signal);
    const resource = resources[0];
    if (!resource) {
      throw new WebDAVClientError('PROPFIND', 502, 'invalid-response');
    }
    return resource;
  }

  /**
   * Create a new directory
   */
  async createDirectory(path: string): Promise<void> {
    const response = await this.request('MKCOL', path);

    if (response.status !== 201 && response.status !== 204) {
      throw new WebDAVClientError('MKCOL', response.status);
    }
  }

  /**
   * Upload a file with optional progress tracking
   */
  async uploadFile(
    path: string,
    file: File | Blob,
    contentType?: string,
    onProgress?: (loaded: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (onProgress) {
      const aborted = abortError(signal);
      if (aborted) throw aborted;
      // Use XMLHttpRequest for progress tracking
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', withBasePath(this.proxyUrl));
        xhr.setRequestHeader('X-WebDAV-Method', 'PUT');
        xhr.setRequestHeader('X-WebDAV-Path', canonicalDavPath(path));
        const slotHeaders = getActiveAccountSlotHeaders();
        if (slotHeaders['X-JMAP-Cookie-Slot']) {
          xhr.setRequestHeader('X-JMAP-Cookie-Slot', slotHeaders['X-JMAP-Cookie-Slot']);
        }
        xhr.setRequestHeader('Content-Type',
          contentType || (file instanceof File ? file.type : 'application/octet-stream'));

        if (signal) {
          signal.addEventListener('abort', () => {
            xhr.abort();
            reject(new DOMException('Upload aborted', 'AbortError'));
          }, { once: true });
        }

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(e.loaded, e.total);
        };
        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 201 || xhr.status === 204) {
            resolve();
          } else {
            reject(new WebDAVClientError('PUT', xhr.status));
          }
        };
        xhr.onerror = () => reject(new WebDAVClientError('PUT', 0, 'network'));
        xhr.send(file);
      });
    }

    const response = await this.request('PUT', path, {
      headers: {
        'Content-Type': contentType || (file instanceof File ? file.type : 'application/octet-stream'),
      },
      body: file,
      signal,
    });

    if (response.status !== 201 && response.status !== 204 && response.status !== 200) {
      throw new WebDAVClientError('PUT', response.status);
    }
  }

  /**
   * Download a file
   */
  async downloadFile(
    path: string,
    signal?: AbortSignal,
  ): Promise<{ blob: Blob; contentType: string; filename: string }> {
    const canonicalPath = canonicalDavPath(path);
    const response = await this.request('GET', canonicalPath, { signal });

    if (!response.ok) {
      throw new WebDAVClientError('GET', response.status);
    }

    let blob: Blob;
    try {
      blob = await response.blob();
    } catch (error) {
      const requestAborted = abortError(signal);
      if (requestAborted) throw requestAborted;
      if (
        (error instanceof DOMException && error.name === 'AbortError')
        || (error instanceof Error && error.name === 'AbortError')
      ) {
        throw error;
      }
      throw new WebDAVClientError('GET', 0, 'network');
    }
    const aborted = abortError(signal);
    if (aborted) throw aborted;
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const encodedName = canonicalPath.split('/').pop() || '';
    const filename = encodedName ? decodeURIComponent(encodedName) : 'download';

    return { blob, contentType, filename };
  }

  /**
   * Delete a file or directory
   */
  async delete(path: string): Promise<void> {
    const response = await this.request('DELETE', path);

    if (response.status !== 204 && response.status !== 200) {
      throw new WebDAVClientError('DELETE', response.status);
    }
  }

  /**
   * Move/rename a resource
   */
  async move(fromPath: string, toPath: string): Promise<void> {
    const response = await this.request('MOVE', fromPath, {
      headers: {
        'X-WebDAV-Destination': canonicalDavPath(toPath),
        'Overwrite': 'F',
      },
    });

    if (response.status !== 201 && response.status !== 204) {
      throw new WebDAVClientError('MOVE', response.status);
    }
  }

  /**
   * Copy a resource
   */
  async copy(fromPath: string, toPath: string): Promise<void> {
    const response = await this.request('COPY', fromPath, {
      headers: {
        'X-WebDAV-Destination': canonicalDavPath(toPath),
        'Overwrite': 'F',
      },
    });

    if (response.status !== 201 && response.status !== 204) {
      throw new WebDAVClientError('COPY', response.status);
    }
  }

  /**
   * Parse a WebDAV multistatus XML response into WebDAVResource[]
   */
  private parseMultistatus(
    xml: string,
    requestPath: string,
    includeSelf: boolean,
  ): WebDAVResource[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      throw new WebDAVClientError('PROPFIND', 502, 'invalid-response');
    }
    const responses = doc.getElementsByTagNameNS('DAV:', 'response');
    const resources: WebDAVResource[] = [];

    // The proxy deliberately does not expose the upstream origin or account
    // URL. Compare the safe, account-relative request path to href suffixes.
    const canonicalRequestPath = canonicalDavPath(requestPath);
    const normalizedRequestPath = decodeURIComponent(canonicalRequestPath).replace(/^\/+|\/+$/g, '');
    let shallowestRootHref = '';
    if (!normalizedRequestPath) {
      const hrefs = Array.from(responses)
        .map((response) => response.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || '')
        .filter(Boolean);
      shallowestRootHref = hrefs.sort((a, b) => {
        const aDepth = new URL(a, 'http://dummy').pathname.split('/').filter(Boolean).length;
        const bDepth = new URL(b, 'http://dummy').pathname.split('/').filter(Boolean).length;
        return aDepth - bDepth;
      })[0] || '';
    }

    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];

      const hrefEl = resp.getElementsByTagNameNS('DAV:', 'href')[0];
      if (!hrefEl?.textContent) continue;

      const href = hrefEl.textContent.trim();
      let hrefPath: string;
      try {
        hrefPath = new URL(href, 'http://dummy').pathname;
      } catch {
        throw new WebDAVClientError('PROPFIND', 502, 'invalid-response');
      }

      // Skip the directory itself (the parent being listed)
      const normalizedHref = hrefPath.replace(/\/+$/, '');
      const isSelf = this.isSameResource(
        normalizedHref,
        normalizedRequestPath,
        shallowestRootHref,
      );
      if (!includeSelf && isSelf) continue;
      if (includeSelf && !isSelf) continue;

      const encodedSegments = hrefPath.replace(/\/+$/, '').split('/');
      const encodedName = encodedSegments[encodedSegments.length - 1] || '';
      let decodedName: string;
      try {
        decodedName = decodeURIComponent(encodedName);
      } catch {
        throw new WebDAVClientError('PROPFIND', 502, 'invalid-response');
      }
      const name = decodedName.normalize('NFC');
      if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
        throw new WebDAVClientError('PROPFIND', 502, 'invalid-response');
      }
      if (
        !includeSelf
        && !this.isDirectChild(normalizedHref, normalizedRequestPath, shallowestRootHref)
      ) {
        continue;
      }

      const propstat = resp.getElementsByTagNameNS('DAV:', 'propstat')[0];
      if (!propstat) continue;

      const statusEl = propstat.getElementsByTagNameNS('DAV:', 'status')[0];
      if (statusEl?.textContent && !statusEl.textContent.includes('200')) continue;

      const prop = propstat.getElementsByTagNameNS('DAV:', 'prop')[0];
      if (!prop) continue;

      const resourceType = prop.getElementsByTagNameNS('DAV:', 'resourcetype')[0];
      const isDirectory = !!resourceType?.getElementsByTagNameNS('DAV:', 'collection')[0];

      const contentType = prop.getElementsByTagNameNS('DAV:', 'getcontenttype')[0]?.textContent || '';
      const contentLengthStr = prop.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent || '0';
      const lastModified = prop.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent || '';
      const etag = prop.getElementsByTagNameNS('DAV:', 'getetag')[0]?.textContent || '';

      const canonicalName = encodeURIComponent(name);
      const contentLength = Number(contentLengthStr);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        throw new WebDAVClientError('PROPFIND', 502, 'invalid-response');
      }
      const resourcePath = includeSelf
        ? canonicalRequestPath
        : joinDavPath(canonicalRequestPath, canonicalName);

      resources.push({
        path: resourcePath,
        href: resourcePath,
        name,
        isDirectory,
        contentType: isDirectory ? '' : contentType,
        contentLength,
        lastModified,
        etag,
      });
    }

    // Sort: directories first, then alphabetically
    resources.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return resources;
  }

  private isSameResource(href: string, requestPath: string, rootHref: string): boolean {
    try {
      const hrefPath = decodeURIComponent(new URL(href, 'http://dummy').pathname).replace(/\/+$/, '');
      if (!requestPath) {
        const rootPath = decodeURIComponent(new URL(rootHref, 'http://dummy').pathname).replace(/\/+$/, '');
        return hrefPath === rootPath;
      }
      return hrefPath === `/${requestPath}` || hrefPath.endsWith(`/${requestPath}`);
    } catch {
      return href === rootHref;
    }
  }

  private isDirectChild(href: string, requestPath: string, rootHref: string): boolean {
    try {
      const hrefPath = decodeURIComponent(new URL(href, 'http://dummy').pathname)
        .replace(/\/+$/, '');
      const slash = hrefPath.lastIndexOf('/');
      const hrefParent = slash <= 0 ? '' : hrefPath.slice(0, slash);
      if (!requestPath) {
        const rootPath = decodeURIComponent(new URL(rootHref, 'http://dummy').pathname)
          .replace(/\/+$/, '');
        return hrefParent === rootPath;
      }
      return hrefParent === `/${requestPath}` || hrefParent.endsWith(`/${requestPath}`);
    } catch {
      return false;
    }
  }
}
