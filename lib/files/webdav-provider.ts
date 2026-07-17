import {
  FileProviderError,
  createFileProviderCapabilities,
  isFileProviderError,
  throwIfFileProviderAborted,
  unsupportedFileProviderOperation,
  type FileCopyRequest,
  type FileCreateDirectoryRequest,
  type FileDeleteRequest,
  type FileDownload,
  type FileDownloadRequest,
  type FileItem,
  type FileItemPermissions,
  type FileListPage,
  type FileListRequest,
  type FileMoveRequest,
  type FileProvider,
  type FileProviderCapabilities,
  type FileProviderErrorCode,
  type FileProviderOperation,
  type FileRenameRequest,
  type FileStatRequest,
  type FileUploadRequest,
} from '@/lib/files/provider';
import {
  WebDAVClientError,
  type WebDAVResource,
} from '@/lib/webdav/client';

/**
 * The narrow WebDAV surface used by the provider. Keeping mutations out of
 * this boundary makes its read-only capability declaration enforceable.
 */
export interface WebDavFileClient {
  checkSupport(signal?: AbortSignal): Promise<boolean>;
  list(path?: string, signal?: AbortSignal): Promise<WebDAVResource[]>;
  stat(path: string, signal?: AbortSignal): Promise<WebDAVResource>;
  downloadFile(
    path: string,
    signal?: AbortSignal,
  ): Promise<{ blob: Blob; contentType: string; filename: string }>;
}

const WEBDAV_FILE_CAPABILITIES = createFileProviderCapabilities({
  browse: true,
  stat: true,
  download: true,
});

const NO_WEBDAV_FILE_CAPABILITIES = createFileProviderCapabilities();

const READ_ONLY_DIRECTORY_PERMISSIONS: FileItemPermissions = Object.freeze({
  read: true,
  download: false,
  addChildren: false,
  modifyContent: false,
  rename: false,
  move: false,
  copy: false,
  delete: false,
});

const READ_ONLY_FILE_PERMISSIONS: FileItemPermissions = Object.freeze({
  ...READ_ONLY_DIRECTORY_PERMISSIONS,
  download: true,
});

function canonicalResourcePath(path: string): string {
  if (
    !path.startsWith('/')
    || path.includes('?')
    || path.includes('#')
    || path.includes('\\')
    || path.includes('\0')
    || (path.length > 1 && path.endsWith('/'))
  ) {
    throw new FileProviderError('unavailable', 'WebDAV returned an invalid resource.');
  }

  const segments = path.split('/').slice(1);
  for (const segment of segments) {
    if (!segment) {
      throw new FileProviderError('unavailable', 'WebDAV returned an invalid resource.');
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new FileProviderError('unavailable', 'WebDAV returned an invalid resource.');
    }
    if (
      decoded === '.'
      || decoded === '..'
      || decoded.includes('/')
      || decoded.includes('\\')
      || decoded.includes('\0')
      || encodeURIComponent(decoded.normalize('NFC')) !== segment
    ) {
      throw new FileProviderError('unavailable', 'WebDAV returned an invalid resource.');
    }
  }
  return path;
}

function pathToItemId(path: string): string {
  return `webdav:${encodeURIComponent(canonicalResourcePath(path))}`;
}

function itemIdToPath(itemId: string): string {
  if (!itemId.startsWith('webdav:')) {
    throw new FileProviderError('not-found', 'File item was not found.');
  }
  try {
    return canonicalResourcePath(decodeURIComponent(itemId.slice('webdav:'.length)));
  } catch (error) {
    if (isFileProviderError(error) && error.code === 'unavailable') {
      throw new FileProviderError('not-found', 'File item was not found.');
    }
    throw error;
  }
}

function parentPath(path: string): string | null {
  const slash = path.lastIndexOf('/');
  return slash <= 0 ? null : path.slice(0, slash);
}

function cursorOffset(cursor?: string): number {
  if (!cursor) return 0;
  const match = /^webdav-offset:(\d+)$/.exec(cursor);
  const offset = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new FileProviderError('invalid-request', 'Invalid continuation cursor.');
  }
  return offset;
}

function pageLimit(limit: number | undefined, itemCount: number): number {
  if (limit === undefined) return Math.max(1, itemCount);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new FileProviderError('invalid-request', 'Invalid page limit.');
  }
  return limit;
}

function modifiedAt(value: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function statusErrorCode(status: number): {
  code: FileProviderErrorCode;
  retryable?: boolean;
} {
  if (status === 400) return { code: 'invalid-request' };
  if (status === 401) return { code: 'not-authenticated' };
  if (status === 403) return { code: 'permission-denied' };
  if (status === 404) return { code: 'not-found' };
  if (status === 405 || status === 501) return { code: 'not-supported' };
  if (status === 408) return { code: 'unavailable', retryable: true };
  if (status === 409 || status === 412 || status === 423) return { code: 'conflict' };
  if (status === 413) return { code: 'too-large' };
  if (status === 429) return { code: 'rate-limited', retryable: true };
  if (status === 507) return { code: 'quota-exceeded' };
  if (status >= 500) return { code: 'unavailable', retryable: true };
  return { code: 'unknown' };
}

export function normalizeWebDavFileError(
  error: unknown,
  operation: FileProviderOperation,
): FileProviderError {
  if (isFileProviderError(error)) return error;
  if (
    (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
  ) {
    return new FileProviderError('aborted', 'File operation was cancelled.');
  }

  if (error instanceof WebDAVClientError) {
    if (error.code === 'network') {
      return new FileProviderError(
        'unavailable',
        `WebDAV file ${operation} failed.`,
        { retryable: true },
      );
    }
    if (error.code === 'invalid-response') {
      return new FileProviderError(
        'unavailable',
        `WebDAV file ${operation} failed.`,
      );
    }
    const normalized = statusErrorCode(error.status);
    return new FileProviderError(
      normalized.code,
      `WebDAV file ${operation} failed.`,
      { retryable: normalized.retryable },
    );
  }

  return new FileProviderError(
    'unknown',
    `WebDAV file ${operation} failed.`,
  );
}

export class WebDavFileProvider implements FileProvider {
  readonly descriptor;
  private support: boolean | null = null;
  private readonly items = new Map<string, FileItem>();

  constructor(
    private readonly client: WebDavFileClient,
    descriptor: { id?: string; displayName?: string } = {},
  ) {
    this.descriptor = Object.freeze({
      id: descriptor.id ?? 'webdav-files',
      displayName: descriptor.displayName ?? 'WebDAV Files',
    });
  }

  private async isSupported(signal?: AbortSignal): Promise<boolean> {
    throwIfFileProviderAborted(signal);
    if (this.support === null) {
      this.support = await this.client.checkSupport(signal);
    }
    throwIfFileProviderAborted(signal);
    return this.support;
  }

  private async execute<T>(
    operation: FileProviderOperation,
    signal: AbortSignal | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      if (!await this.isSupported(signal)) {
        throw unsupportedFileProviderOperation(operation);
      }
      const result = await action();
      throwIfFileProviderAborted(signal);
      return result;
    } catch (error) {
      throw normalizeWebDavFileError(error, operation);
    }
  }

  private resourceToItem(
    resource: WebDAVResource,
    expectedParentPath?: string,
  ): FileItem {
    const path = canonicalResourcePath(resource.path);
    const encodedName = path.split('/').pop() || '';
    const canonicalName = encodedName ? decodeURIComponent(encodedName) : '';
    const actualParentPath = parentPath(path);
    const normalizedExpectedParent = expectedParentPath === '/'
      ? null
      : expectedParentPath;
    if (
      !canonicalName
      || canonicalName !== resource.name
      || !Number.isSafeInteger(resource.contentLength)
      || resource.contentLength < 0
      || (
        expectedParentPath !== undefined
        && actualParentPath !== normalizedExpectedParent
      )
    ) {
      throw new FileProviderError('unavailable', 'WebDAV returned an invalid resource.');
    }

    const id = pathToItemId(path);
    const normalizedModifiedAt = modifiedAt(resource.lastModified);
    const item = Object.freeze({
      id,
      parentId: actualParentPath === null ? null : pathToItemId(actualParentPath),
      name: resource.name,
      kind: resource.isDirectory ? 'directory' as const : 'file' as const,
      mediaType: resource.isDirectory
        ? null
        : (resource.contentType || 'application/octet-stream'),
      size: resource.isDirectory ? null : resource.contentLength,
      ...(normalizedModifiedAt
        ? { modifiedAt: normalizedModifiedAt }
        : {}),
      ...(resource.etag ? { version: resource.etag } : {}),
      permissions: resource.isDirectory
        ? READ_ONLY_DIRECTORY_PERMISSIONS
        : READ_ONLY_FILE_PERMISSIONS,
    });
    this.items.set(id, item);
    return item;
  }

  private async resolveItem(itemId: string, signal?: AbortSignal): Promise<{
    item: FileItem;
    path: string;
  }> {
    const path = itemIdToPath(itemId);
    const cached = this.items.get(itemId);
    if (cached) return { item: cached, path };
    const resource = await this.client.stat(path, signal);
    const item = this.resourceToItem(resource);
    if (item.id !== itemId) {
      throw new FileProviderError('not-found', 'File item was not found.');
    }
    return { item, path };
  }

  async getCapabilities(options?: { signal?: AbortSignal }): Promise<FileProviderCapabilities> {
    try {
      return await this.isSupported(options?.signal)
        ? WEBDAV_FILE_CAPABILITIES
        : NO_WEBDAV_FILE_CAPABILITIES;
    } catch (error) {
      throw normalizeWebDavFileError(error, 'browse');
    }
  }

  async list(request: FileListRequest): Promise<FileListPage> {
    return this.execute('browse', request.signal, async () => {
      const path = request.parentId === null ? '/' : itemIdToPath(request.parentId);
      const resources = await this.client.list(path, request.signal);
      const items = resources.map((resource) => this.resourceToItem(resource, path));
      const offset = cursorOffset(request.cursor);
      const limit = pageLimit(request.limit, items.length);
      const pageItems = items.slice(offset, offset + limit);
      const nextOffset = offset + pageItems.length;
      return {
        items: pageItems,
        nextCursor: nextOffset < items.length ? `webdav-offset:${nextOffset}` : null,
      };
    });
  }

  async stat(request: FileStatRequest): Promise<FileItem> {
    return this.execute('stat', request.signal, async () =>
      (await this.resolveItem(request.itemId, request.signal)).item);
  }

  async download(request: FileDownloadRequest): Promise<FileDownload> {
    return this.execute('download', request.signal, async () => {
      const { item, path } = await this.resolveItem(request.itemId, request.signal);
      if (item.kind === 'directory') {
        throw new FileProviderError('invalid-request', 'Directories cannot be downloaded.');
      }
      const downloaded = await this.client.downloadFile(path, request.signal);
      return {
        body: downloaded.blob,
        fileName: item.name,
        mediaType: downloaded.contentType || item.mediaType || 'application/octet-stream',
        size: item.size ?? downloaded.blob.size,
        ...(item.version ? { version: item.version } : {}),
      };
    });
  }

  async upload(_request: FileUploadRequest): Promise<FileItem> {
    throw unsupportedFileProviderOperation('upload');
  }

  async createDirectory(_request: FileCreateDirectoryRequest): Promise<FileItem> {
    throw unsupportedFileProviderOperation('createDirectory');
  }

  async rename(_request: FileRenameRequest): Promise<FileItem> {
    throw unsupportedFileProviderOperation('rename');
  }

  async move(_request: FileMoveRequest): Promise<FileItem> {
    throw unsupportedFileProviderOperation('move');
  }

  async copy(_request: FileCopyRequest): Promise<FileItem> {
    throw unsupportedFileProviderOperation('copy');
  }

  async delete(_request: FileDeleteRequest): Promise<void> {
    throw unsupportedFileProviderOperation('delete');
  }
}
