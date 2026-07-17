import { describe, expect, it, vi } from 'vitest';
import type { IJMAPClient } from '@/lib/jmap/client-interface';
import type { FileNode, FileNodeRights } from '@/lib/jmap/types';
import {
  JmapFileProvider,
  createJmapFileServices,
} from '@/lib/files/jmap-provider';

const FULL_RIGHTS: FileNodeRights = {
  mayRead: true,
  mayAddChildren: true,
  mayRename: true,
  mayDelete: true,
  mayModifyContent: true,
  mayShare: true,
};

function node(
  id: string,
  name: string,
  parentId: string | null,
  blobId: string | null,
  overrides: Partial<FileNode> = {},
): FileNode {
  return {
    id,
    parentId,
    name,
    type: blobId ? 'text/plain' : '',
    blobId,
    size: blobId ? 12 : 0,
    created: '2026-07-16T10:00:00.000Z',
    updated: '2026-07-16T11:00:00.000Z',
    ...overrides,
  };
}

function makeClient(initial: FileNode[] = [], supported = true) {
  let nodes = initial.map((item) => ({ ...item }));
  let sequence = 0;

  const client = {
    probeFileNodeSupport: vi.fn(async () => supported),
    listAllFileNodes: vi.fn(async () => nodes.map((item) => ({ ...item }))),
    listAllFileNodesAcrossAccounts: vi.fn(async () =>
      nodes.map((item) => ({ ...item }))),
    getFileNodes: vi.fn(async (ids: string[] | null) =>
      (ids === null ? nodes : nodes.filter((item) => ids.includes(item.id)))
        .map((item) => ({ ...item }))),
    fetchBlob: vi.fn(async () => new Blob(['provider data'], { type: 'text/plain' })),
    uploadBlob: vi.fn(async (
      file: File,
      options?: {
        onProgress?: (loaded: number, total: number) => void;
        signal?: AbortSignal;
      },
    ) => {
      options?.onProgress?.(file.size, file.size);
      return { blobId: `blob-${++sequence}`, size: file.size, type: file.type };
    }),
    createFileNode: vi.fn(async (
      name: string,
      blobId: string,
      type: string,
      size: number,
      parentId: string | null,
    ) => {
      const created = node(`file-${++sequence}`, name, parentId, blobId, {
        type,
        size,
      });
      nodes.push(created);
      return { ...created };
    }),
    createFileDirectory: vi.fn(async (name: string, parentId: string | null) => {
      const created = node(`directory-${++sequence}`, name, parentId, null);
      nodes.push(created);
      return { ...created };
    }),
    updateFileNode: vi.fn(async (
      id: string,
      patch: Partial<Pick<FileNode, 'name' | 'parentId'>>,
    ) => {
      const existing = nodes.find((item) => item.id === id);
      if (!existing) throw new Error('File node not found');
      Object.assign(existing, patch);
    }),
    copyFileNode: vi.fn(async (
      id: string,
      name: string,
      parentId: string | null,
    ) => {
      const source = nodes.find((item) => item.id === id);
      if (!source) throw new Error('File node not found');
      const copy = node(`copy-${++sequence}`, name, parentId, source.blobId, {
        type: source.type,
        size: source.size,
      });
      nodes.push(copy);
      return { ...copy };
    }),
    destroyFileNodes: vi.fn(async (ids: string[]) => {
      nodes = nodes.filter((item) => !ids.includes(item.id));
      return { destroyed: ids, notDestroyed: [] };
    }),
    supportsPrincipals: vi.fn(() => true),
    getFilesAccountId: vi.fn(() => 'account-primary'),
    getPrincipals: vi.fn(async () => [{
      id: 'principal-1',
      type: 'individual' as const,
      name: 'Test User',
    }]),
    setFileNodeShare: vi.fn(async () => undefined),
  };

  return client as unknown as IJMAPClient & typeof client;
}

describe('JmapFileProvider', () => {
  it('maps JMAP nodes to provider-neutral items without leaking blob or account ids', async () => {
    const client = makeClient([
      node('folder-1', 'Documents', null, null),
      node('file-1', 'notes.txt', null, 'blob-secret', {
        accountId: 'account-secret',
        accountName: 'Shared owner',
        isShared: true,
        myRights: {
          ...FULL_RIGHTS,
          mayRename: false,
          mayDelete: false,
        },
      }),
    ]);
    const provider = new JmapFileProvider(client);

    const page = await provider.list({ parentId: null });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]).not.toHaveProperty('blobId');
    expect(page.items[0]).not.toHaveProperty('accountId');
    expect(page.items[0]).not.toHaveProperty('href');
    expect(page.items[1]).toMatchObject({
      id: 'file-1',
      kind: 'file',
      mediaType: 'text/plain',
      owner: { id: 'account-secret', displayName: 'Shared owner' },
      isShared: true,
      permissions: {
        read: true,
        download: true,
        rename: false,
        move: false,
        delete: false,
      },
    });
  });

  it('uses opaque continuation cursors and honors requested page sizes', async () => {
    const provider = new JmapFileProvider(makeClient([
      node('file-1', 'one.txt', null, 'blob-1'),
      node('file-2', 'two.txt', null, 'blob-2'),
      node('file-3', 'three.txt', null, 'blob-3'),
    ]));

    const first = await provider.list({ parentId: null, limit: 2 });
    const second = await provider.list({
      parentId: null,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });

    expect(first.items.map((item) => item.id)).toEqual(['file-1', 'file-2']);
    expect(first.nextCursor).not.toBeNull();
    expect(second.items.map((item) => item.id)).toEqual(['file-3']);
    expect(second.nextCursor).toBeNull();
  });

  it('returns no capabilities and rejects operations when FileNode is unsupported', async () => {
    const provider = new JmapFileProvider(makeClient([], false));

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
  });

  it('normalizes cancellation before JMAP I/O', async () => {
    const client = makeClient([node('file-1', 'one.txt', null, 'blob-1')]);
    const provider = new JmapFileProvider(client);
    const controller = new AbortController();
    controller.abort('test');

    await expect(provider.list({
      parentId: null,
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'aborted' });
    expect(client.listAllFileNodes).not.toHaveBeenCalled();
  });

  it('normalizes and sanitizes transport failures', async () => {
    const client = makeClient();
    client.listAllFileNodes.mockRejectedValueOnce(
      new Error('network timeout at https://private.example?token=secret'),
    );
    const provider = new JmapFileProvider(client);

    const rejection = provider.list({ parentId: null });
    await expect(rejection).rejects.toMatchObject({
      code: 'unavailable',
      retryable: true,
      message: 'JMAP file browse failed.',
    });
    await expect(rejection).rejects.not.toMatchObject({
      message: expect.stringContaining('private.example'),
    });
    await expect(rejection).rejects.toMatchObject({ cause: undefined });
  });

  it('routes uploads and downloads through web-standard content values', async () => {
    const client = makeClient([node('file-1', 'one.txt', null, 'blob-1')]);
    const provider = new JmapFileProvider(client);
    await provider.list({ parentId: null });
    const progress = vi.fn();

    const uploaded = await provider.upload({
      parentId: null,
      name: 'upload.txt',
      body: new Blob(['upload'], { type: 'text/plain' }),
      mediaType: 'text/plain',
      size: 6,
      onProgress: progress,
    });
    const downloaded = await provider.download({ itemId: 'file-1' });

    expect(uploaded).toMatchObject({ name: 'upload.txt', kind: 'file' });
    expect(progress).toHaveBeenCalledWith({
      transferredBytes: 6,
      totalBytes: 6,
    });
    expect(downloaded.body).toBeInstanceOf(Blob);
    expect(downloaded).toMatchObject({
      fileName: 'one.txt',
      mediaType: 'text/plain',
      size: 12,
    });
  });
});

describe('JMAP file collaboration service', () => {
  it('translates collaboration rights independently of the base provider', async () => {
    const client = makeClient([
      node('file-1', 'one.txt', null, 'blob-1', {
        myRights: FULL_RIGHTS,
        shareWith: {
          'principal-1': {
            ...FULL_RIGHTS,
            mayAddChildren: false,
            mayModifyContent: false,
            mayShare: false,
          },
        },
      }),
    ]);
    const { provider, collaboration } = createJmapFileServices(client);
    await provider.list({ parentId: null });

    expect(collaboration.getMetadata('file-1')).toEqual({
      ownPermissions: {
        read: true,
        addChildren: true,
        rename: true,
        delete: true,
        modifyContent: true,
        manageSharing: true,
      },
      shares: {
        'principal-1': {
          read: true,
          addChildren: false,
          rename: true,
          delete: true,
          modifyContent: false,
          manageSharing: false,
        },
      },
    });

    await collaboration.setShare('file-1', 'principal-2', {
      read: true,
      addChildren: false,
      rename: false,
      delete: false,
      modifyContent: false,
      manageSharing: false,
    });

    expect(client.setFileNodeShare).toHaveBeenCalledWith(
      'file-1',
      'principal-2',
      {
        mayRead: true,
        mayAddChildren: false,
        mayRename: false,
        mayDelete: false,
        mayModifyContent: false,
        mayShare: false,
      },
    );
  });
});
