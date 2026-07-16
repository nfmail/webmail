/**
 * Provider-neutral file access for the NF Mail Files UI.
 *
 * Identifiers and cursors are opaque. Consumers must not infer paths, account
 * ids, transport URLs, or protocol details from them.
 */

export const FILE_PROVIDER_OPERATIONS = [
  'browse',
  'stat',
  'download',
  'upload',
  'createDirectory',
  'rename',
  'move',
  'copy',
  'delete',
] as const;

export type FileProviderOperation = (typeof FILE_PROVIDER_OPERATIONS)[number];

export type FileProviderCapabilities = Readonly<
  Record<FileProviderOperation, boolean>
>;

const NO_FILE_PROVIDER_CAPABILITIES: FileProviderCapabilities = Object.freeze({
  browse: false,
  stat: false,
  download: false,
  upload: false,
  createDirectory: false,
  rename: false,
  move: false,
  copy: false,
  delete: false,
});

/** Build a complete capability set while keeping unsupported operations off. */
export function createFileProviderCapabilities(
  overrides: Partial<FileProviderCapabilities> = {},
): FileProviderCapabilities {
  return Object.freeze({ ...NO_FILE_PROVIDER_CAPABILITIES, ...overrides });
}

export interface FileProviderDescriptor {
  /** Stable id for selecting this configured provider instance. */
  readonly id: string;
  readonly displayName: string;
}

export type FileItemKind = 'file' | 'directory';

/**
 * Item-level authorization. Provider capabilities describe what the provider
 * can do in general; these permissions describe what it may do to this item.
 */
export interface FileItemPermissions {
  readonly read: boolean;
  readonly download: boolean;
  readonly addChildren: boolean;
  readonly modifyContent: boolean;
  readonly rename: boolean;
  readonly move: boolean;
  readonly copy: boolean;
  readonly delete: boolean;
}

export interface FileOwner {
  /** Opaque provider-owned principal or account id, when available. */
  readonly id?: string;
  readonly displayName?: string;
}

export interface FileItem {
  /** Opaque within the provider instance. */
  readonly id: string;
  /** null identifies an item directly below the provider root. */
  readonly parentId: string | null;
  readonly name: string;
  readonly kind: FileItemKind;
  readonly mediaType: string | null;
  /** null when the provider does not know the size or for directories. */
  readonly size: number | null;
  /** ISO-8601 timestamps when supplied by the provider. */
  readonly createdAt?: string;
  readonly modifiedAt?: string;
  /** Opaque revision token for cache validation or optimistic concurrency. */
  readonly version?: string;
  readonly permissions: FileItemPermissions;
  readonly owner?: FileOwner;
  readonly isShared?: boolean;
}

export interface FileOperationOptions {
  /**
   * Providers must stop promptly where possible and reject with an `aborted`
   * FileProviderError when this signal is aborted.
   */
  readonly signal?: AbortSignal;
}

export interface FileListRequest extends FileOperationOptions {
  readonly parentId: string | null;
  /** Opaque continuation token previously returned by the same provider. */
  readonly cursor?: string;
  /** Requested maximum; providers may return fewer items. */
  readonly limit?: number;
}

export interface FileListPage {
  readonly items: readonly FileItem[];
  /** null means the listing is complete. */
  readonly nextCursor: string | null;
}

export interface FileStatRequest extends FileOperationOptions {
  readonly itemId: string;
}

export type FileContent = Blob | ReadableStream<Uint8Array>;

export interface FileDownloadRequest extends FileOperationOptions {
  readonly itemId: string;
}

export interface FileDownload {
  readonly body: FileContent;
  readonly fileName: string;
  readonly mediaType: string;
  readonly size: number | null;
  readonly version?: string;
}

export interface FileTransferProgress {
  readonly transferredBytes: number;
  readonly totalBytes: number | null;
}

export interface FileUploadRequest extends FileOperationOptions {
  readonly parentId: string | null;
  readonly name: string;
  readonly body: FileContent;
  readonly mediaType?: string;
  readonly size?: number;
  readonly onProgress?: (progress: FileTransferProgress) => void;
}

export interface FileCreateDirectoryRequest extends FileOperationOptions {
  readonly parentId: string | null;
  readonly name: string;
}

export interface FileRenameRequest extends FileOperationOptions {
  readonly itemId: string;
  readonly name: string;
}

export interface FileMoveRequest extends FileOperationOptions {
  readonly itemId: string;
  readonly destinationParentId: string | null;
}

export interface FileCopyRequest extends FileOperationOptions {
  readonly itemId: string;
  readonly destinationParentId: string | null;
  readonly name?: string;
}

export interface FileDeleteRequest extends FileOperationOptions {
  readonly itemId: string;
}

/**
 * Internal application boundary implemented by built-in providers.
 *
 * Every method rejects with FileProviderError. A method whose capability is
 * false rejects with `not-supported`; consumers must use getCapabilities()
 * to hide or disable unavailable actions before invoking it.
 */
export interface FileProvider {
  readonly descriptor: FileProviderDescriptor;

  getCapabilities(options?: FileOperationOptions): Promise<FileProviderCapabilities>;
  list(request: FileListRequest): Promise<FileListPage>;
  stat(request: FileStatRequest): Promise<FileItem>;
  download(request: FileDownloadRequest): Promise<FileDownload>;
  upload(request: FileUploadRequest): Promise<FileItem>;
  createDirectory(request: FileCreateDirectoryRequest): Promise<FileItem>;
  rename(request: FileRenameRequest): Promise<FileItem>;
  move(request: FileMoveRequest): Promise<FileItem>;
  copy(request: FileCopyRequest): Promise<FileItem>;
  delete(request: FileDeleteRequest): Promise<void>;
}

export const FILE_PROVIDER_ERROR_CODES = [
  'aborted',
  'not-authenticated',
  'permission-denied',
  'not-found',
  'already-exists',
  'conflict',
  'invalid-request',
  'not-supported',
  'quota-exceeded',
  'rate-limited',
  'too-large',
  'unavailable',
  'unknown',
] as const;

export type FileProviderErrorCode = (typeof FILE_PROVIDER_ERROR_CODES)[number];

export interface FileProviderErrorOptions {
  readonly retryable?: boolean;
  readonly retryAfterMs?: number;
  readonly cause?: unknown;
}

/** A sanitized error safe for provider-neutral consumers. */
export class FileProviderError extends Error {
  readonly code: FileProviderErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  override readonly cause?: unknown;

  constructor(
    code: FileProviderErrorCode,
    message: string,
    options: FileProviderErrorOptions = {},
  ) {
    super(message);
    this.name = 'FileProviderError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.cause = options.cause;
  }
}

export function isFileProviderError(error: unknown): error is FileProviderError {
  return error instanceof FileProviderError;
}

export function throwIfFileProviderAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new FileProviderError('aborted', 'File operation was cancelled.', {
      cause: signal.reason,
    });
  }
}

export function unsupportedFileProviderOperation(
  operation: FileProviderOperation,
): FileProviderError {
  return new FileProviderError(
    'not-supported',
    `File operation "${operation}" is not supported by this provider.`,
  );
}
