import { describe, expect, it } from 'vitest';
import {
  FileProviderError,
  createFileProviderCapabilities,
  isFileProviderError,
  throwIfFileProviderAborted,
  unsupportedFileProviderOperation,
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
  type FileRenameRequest,
  type FileCopyRequest,
  type FileStatRequest,
  type FileUploadRequest,
} from '@/lib/files/provider';

const READ_ONLY_PERMISSIONS: FileItemPermissions = Object.freeze({
  read: true,
  download: true,
  addChildren: false,
  modifyContent: false,
  rename: false,
  move: false,
  copy: true,
  delete: false,
});

const README: FileItem = Object.freeze({
  id: 'opaque-item-1',
  parentId: null,
  name: 'README.txt',
  kind: 'file',
  mediaType: 'text/plain',
  size: 4,
  modifiedAt: '2026-07-16T00:00:00.000Z',
  version: 'opaque-version-1',
  permissions: READ_ONLY_PERMISSIONS,
});

class ReadOnlyProvider implements FileProvider {
  readonly descriptor = Object.freeze({
    id: 'read-only-fixture',
    displayName: 'Read-only fixture',
  });

  async getCapabilities() {
    return createFileProviderCapabilities({
      browse: true,
      stat: true,
      download: true,
      copy: true,
    });
  }

  async list(request: FileListRequest): Promise<FileListPage> {
    throwIfFileProviderAborted(request.signal);
    return { items: request.parentId === null ? [README] : [], nextCursor: null };
  }

  async stat(request: FileStatRequest): Promise<FileItem> {
    throwIfFileProviderAborted(request.signal);
    return README;
  }

  async download(request: FileDownloadRequest): Promise<FileDownload> {
    throwIfFileProviderAborted(request.signal);
    return {
      body: new Blob(['test'], { type: 'text/plain' }),
      fileName: README.name,
      mediaType: README.mediaType ?? 'application/octet-stream',
      size: README.size,
      version: README.version,
    };
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
    return README;
  }

  async delete(_request: FileDeleteRequest): Promise<void> {
    throw unsupportedFileProviderOperation('delete');
  }
}

describe('FileProvider contract', () => {
  it('builds a complete immutable capability set for partial providers', async () => {
    const capabilities = await new ReadOnlyProvider().getCapabilities();

    expect(capabilities).toEqual({
      browse: true,
      stat: true,
      download: true,
      upload: false,
      createDirectory: false,
      rename: false,
      move: false,
      copy: true,
      delete: false,
    });
    expect(Object.isFrozen(capabilities)).toBe(true);
  });

  it('uses opaque ids and an explicit continuation boundary for browsing', async () => {
    const page = await new ReadOnlyProvider().list({ parentId: null, limit: 25 });

    expect(page).toEqual({ items: [README], nextCursor: null });
    expect(page.items[0]).not.toHaveProperty('href');
    expect(page.items[0]).not.toHaveProperty('blobId');
    expect(page.items[0]).not.toHaveProperty('accountId');
  });

  it('normalizes unsupported operations', async () => {
    const provider = new ReadOnlyProvider();

    await expect(provider.upload({
      parentId: null,
      name: 'upload.txt',
      body: new Blob(['upload']),
    })).rejects.toMatchObject({
      name: 'FileProviderError',
      code: 'not-supported',
      retryable: false,
    });
  });

  it('normalizes cancellation before provider I/O', async () => {
    const controller = new AbortController();
    controller.abort('test cancellation');

    await expect(new ReadOnlyProvider().list({
      parentId: null,
      signal: controller.signal,
    })).rejects.toMatchObject({
      code: 'aborted',
      cause: 'test cancellation',
    });
  });

  it('provides a detectable error type with retry metadata', () => {
    const error = new FileProviderError('rate-limited', 'Try again later.', {
      retryable: true,
      retryAfterMs: 30_000,
    });

    expect(isFileProviderError(error)).toBe(true);
    expect(isFileProviderError(new Error('raw transport error'))).toBe(false);
    expect(error.retryAfterMs).toBe(30_000);
  });
});
