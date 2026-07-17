import { describe, expect, it, vi } from 'vitest';
import {
  WebDavFileProvider,
  type WebDavFileClient,
} from '@/lib/files/webdav-provider';
import {
  WebDAVClientError,
  type WebDAVResource,
} from '@/lib/webdav/client';

function resource(
  path: string,
  name: string,
  isDirectory: boolean,
  overrides: Partial<WebDAVResource> = {},
): WebDAVResource {
  return {
    path,
    href: path,
    name,
    isDirectory,
    contentType: isDirectory ? '' : 'text/plain',
    contentLength: isDirectory ? 0 : 12,
    lastModified: 'Fri, 17 Jul 2026 10:30:00 GMT',
    etag: '"revision-1"',
    ...overrides,
  };
}

function makeClient(resources: WebDAVResource[] = [], supported = true) {
  const client = {
    checkSupport: vi.fn(async (_signal?: AbortSignal) => supported),
    list: vi.fn(async (_path?: string, _signal?: AbortSignal) => resources),
    stat: vi.fn(async (path: string, _signal?: AbortSignal) => {
      const match = resources.find((item) => item.path === path);
      if (!match) throw new WebDAVClientError('PROPFIND', 404);
      return match;
    }),
    downloadFile: vi.fn(async (_path: string, _signal?: AbortSignal) => ({
      blob: new Blob(['provider data'], { type: 'text/plain' }),
      contentType: 'text/plain',
      filename: 'ignored-transport-name.txt',
    })),
  };
  return client satisfies WebDavFileClient;
}

describe('WebDavFileProvider', () => {
  it('advertises only its supported read-only operations', async () => {
    const capabilities = await new WebDavFileProvider(makeClient()).getCapabilities();

    expect(capabilities).toEqual({
      browse: true,
      stat: true,
      download: true,
      upload: false,
      createDirectory: false,
      rename: false,
      move: false,
      copy: false,
      delete: false,
    });
    expect(Object.isFrozen(capabilities)).toBe(true);
  });

  it('returns no capabilities and rejects browsing when WebDAV is unavailable', async () => {
    const client = makeClient([], false);
    const provider = new WebDavFileProvider(client);

    await expect(provider.getCapabilities()).resolves.toEqual({
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
    await expect(provider.list({ parentId: null })).rejects.toMatchObject({
      code: 'not-supported',
    });
    expect(client.checkSupport).toHaveBeenCalledTimes(1);
    expect(client.list).not.toHaveBeenCalled();
  });

  it('maps root resources to provider-neutral metadata without transport details', async () => {
    const provider = new WebDavFileProvider(makeClient([
      resource('/Documents', 'Documents', true),
      resource('/notes.txt', 'notes.txt', false),
    ]));

    const page = await provider.list({ parentId: null });

    expect(page.nextCursor).toBeNull();
    expect(page.items[0]).toMatchObject({
      parentId: null,
      name: 'Documents',
      kind: 'directory',
      mediaType: null,
      size: null,
      modifiedAt: '2026-07-17T10:30:00.000Z',
      version: '"revision-1"',
      permissions: {
        read: true,
        download: false,
        addChildren: false,
        rename: false,
        move: false,
        copy: false,
        delete: false,
      },
    });
    expect(page.items[1]).toMatchObject({
      parentId: null,
      name: 'notes.txt',
      kind: 'file',
      mediaType: 'text/plain',
      size: 12,
      permissions: {
        read: true,
        download: true,
        modifyContent: false,
      },
    });
    expect(page.items[0]).not.toHaveProperty('path');
    expect(page.items[0]).not.toHaveProperty('href');
    expect(JSON.stringify(page.items)).not.toContain('/dav/file/');
  });

  it('navigates nested directories with opaque ids and encoded safe paths', async () => {
    const client = makeClient([
      resource('/Documents', 'Documents', true),
    ]);
    const provider = new WebDavFileProvider(client);
    const root = await provider.list({ parentId: null });
    client.list.mockResolvedValueOnce([
      resource('/Documents/Quarterly%20report.txt', 'Quarterly report.txt', false),
    ]);

    const nested = await provider.list({ parentId: root.items[0].id });

    expect(client.list).toHaveBeenLastCalledWith('/Documents', undefined);
    expect(nested.items[0]).toMatchObject({
      parentId: root.items[0].id,
      name: 'Quarterly report.txt',
    });
    expect(nested.items[0].id).not.toBe('/Documents/Quarterly%20report.txt');
  });

  it('supports independent stat and download with normalized metadata', async () => {
    const resources = [
      resource('/report.txt', 'report.txt', false, {
        contentType: 'application/pdf',
        contentLength: 42,
      }),
    ];
    const firstProvider = new WebDavFileProvider(makeClient(resources));
    const itemId = (await firstProvider.list({ parentId: null })).items[0].id;
    const client = makeClient(resources);
    const provider = new WebDavFileProvider(client);

    const item = await provider.stat({ itemId });
    const downloaded = await provider.download({ itemId });

    expect(client.stat).toHaveBeenCalledWith('/report.txt', undefined);
    expect(item).toMatchObject({
      name: 'report.txt',
      mediaType: 'application/pdf',
      size: 42,
    });
    expect(client.downloadFile).toHaveBeenCalledWith('/report.txt', undefined);
    expect(downloaded).toMatchObject({
      fileName: 'report.txt',
      mediaType: 'text/plain',
      size: 42,
      version: '"revision-1"',
    });
    expect(downloaded.body).toBeInstanceOf(Blob);
  });

  it('uses coded errors and never exposes raw transport failure details', async () => {
    const client = makeClient();
    client.list
      .mockRejectedValueOnce(new WebDAVClientError('PROPFIND', 403))
      .mockRejectedValueOnce(new WebDAVClientError('PROPFIND', 0, 'network'))
      .mockRejectedValueOnce(
        new Error('token=secret at https://private.example/dav/file/account'),
      );
    const provider = new WebDavFileProvider(client);

    await expect(provider.list({ parentId: null })).rejects.toMatchObject({
      code: 'permission-denied',
      retryable: false,
      message: 'WebDAV file browse failed.',
      cause: undefined,
    });
    await expect(provider.list({ parentId: null })).rejects.toMatchObject({
      code: 'unavailable',
      retryable: true,
      message: 'WebDAV file browse failed.',
      cause: undefined,
    });
    const unknownFailure = provider.list({ parentId: null });
    await expect(unknownFailure).rejects.toMatchObject({
      code: 'unknown',
      retryable: false,
      message: 'WebDAV file browse failed.',
      cause: undefined,
    });
    await expect(unknownFailure).rejects.not.toMatchObject({
      message: expect.stringContaining('private.example'),
    });
  });

  it('honors pagination and rejects invalid cursors and limits', async () => {
    const provider = new WebDavFileProvider(makeClient([
      resource('/one.txt', 'one.txt', false),
      resource('/two.txt', 'two.txt', false),
      resource('/three.txt', 'three.txt', false),
    ]));

    const first = await provider.list({ parentId: null, limit: 2 });
    const second = await provider.list({
      parentId: null,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });

    expect(first.items.map((item) => item.name)).toEqual(['one.txt', 'two.txt']);
    expect(first.nextCursor).toBe('webdav-offset:2');
    expect(second.items.map((item) => item.name)).toEqual(['three.txt']);
    expect(second.nextCursor).toBeNull();
    await expect(provider.list({
      parentId: null,
      cursor: 'webdav-offset:not-a-number',
    })).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(provider.list({
      parentId: null,
      limit: 0,
    })).rejects.toMatchObject({ code: 'invalid-request' });
  });

  it('normalizes cancellation before WebDAV I/O and forwards live signals', async () => {
    const client = makeClient();
    const provider = new WebDavFileProvider(client);
    const cancelled = new AbortController();
    cancelled.abort('test');

    await expect(provider.list({
      parentId: null,
      signal: cancelled.signal,
    })).rejects.toMatchObject({ code: 'aborted' });
    expect(client.checkSupport).not.toHaveBeenCalled();

    const live = new AbortController();
    await provider.list({ parentId: null, signal: live.signal });
    expect(client.checkSupport).toHaveBeenCalledWith(live.signal);
    expect(client.list).toHaveBeenCalledWith('/', live.signal);
  });

  it('rejects every mutation as not supported', async () => {
    const provider = new WebDavFileProvider(makeClient());
    const body = new Blob(['data']);

    const mutations = [
      provider.upload({ parentId: null, name: 'new.txt', body }),
      provider.createDirectory({ parentId: null, name: 'new' }),
      provider.rename({ itemId: 'unused', name: 'new.txt' }),
      provider.move({ itemId: 'unused', destinationParentId: null }),
      provider.copy({ itemId: 'unused', destinationParentId: null }),
      provider.delete({ itemId: 'unused' }),
    ];

    for (const mutation of mutations) {
      await expect(mutation).rejects.toMatchObject({ code: 'not-supported' });
    }
  });
});
