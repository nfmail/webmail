import { describe, expect, it, vi } from 'vitest';
import type { IJMAPClient } from '@/lib/jmap/client-interface';
import type { FileNode } from '@/lib/jmap/types';
import { JmapEmailAttachmentSource } from '@/lib/files/email-attachment-source';

function node(
  id: string,
  name: string,
  parentId: string | null,
  blobId: string | null,
): FileNode {
  return {
    id,
    name,
    parentId,
    blobId,
    type: blobId ? 'text/plain' : '',
    size: blobId ? 42 : 0,
    created: '2026-07-17T10:00:00.000Z',
    updated: '2026-07-17T11:00:00.000Z',
  };
}

function makeClient(nodes: FileNode[]) {
  const client = {
    probeFileNodeSupport: vi.fn(async () => true),
    listAllFileNodes: vi.fn(async () => nodes.map((item) => ({ ...item }))),
    listAllFileNodesAcrossAccounts: vi.fn(async () =>
      nodes.map((item) => ({ ...item }))),
    getFileNodes: vi.fn(async (ids: string[] | null) =>
      (ids === null ? nodes : nodes.filter((item) => ids.includes(item.id)))
        .map((item) => ({ ...item }))),
    uploadBlob: vi.fn(),
    fetchBlob: vi.fn(),
  };
  return client as unknown as IJMAPClient & typeof client;
}

describe('JmapEmailAttachmentSource', () => {
  it('resolves selected FileItems to existing JMAP blobs without transferring content', async () => {
    const client = makeClient([
      node('folder-1', 'Documents', null, null),
      node('file-1', 'notes.txt', null, 'blob-1'),
      node('file-2', 'report.txt', 'folder-1', 'blob-2'),
    ]);
    const source = new JmapEmailAttachmentSource(client);

    const root = await source.list({ parentId: null });
    const attachments = await source.resolve(['file-1']);

    expect(root.items.map((item) => item.name)).toEqual([
      'Documents',
      'notes.txt',
    ]);
    expect(attachments).toEqual([{
      blobId: 'blob-1',
      name: 'notes.txt',
      type: 'text/plain',
      size: 42,
    }]);
    expect(client.uploadBlob).not.toHaveBeenCalled();
    expect(client.fetchBlob).not.toHaveBeenCalled();
  });

  it('deduplicates ids while preserving selection order', async () => {
    const source = new JmapEmailAttachmentSource(makeClient([
      node('file-1', 'one.txt', null, 'blob-1'),
      node('file-2', 'two.txt', null, 'blob-2'),
    ]));

    const attachments = await source.resolve([
      'file-2',
      'file-1',
      'file-2',
    ]);

    expect(attachments.map((item) => item.blobId)).toEqual([
      'blob-2',
      'blob-1',
    ]);
  });

  it('returns coded errors for missing files and directories', async () => {
    const source = new JmapEmailAttachmentSource(makeClient([
      node('folder-1', 'Documents', null, null),
    ]));

    await expect(source.resolve(['missing'])).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(source.resolve(['folder-1'])).rejects.toMatchObject({
      code: 'invalid-request',
    });
  });

  it('honors cancellation before JMAP I/O', async () => {
    const client = makeClient([node('file-1', 'one.txt', null, 'blob-1')]);
    const source = new JmapEmailAttachmentSource(client);
    const controller = new AbortController();
    controller.abort();

    await expect(source.resolve(['file-1'], {
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'aborted' });
    expect(client.getFileNodes).not.toHaveBeenCalled();
  });
});
