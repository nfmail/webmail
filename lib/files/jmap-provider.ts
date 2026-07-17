import type { IJMAPClient } from '@/lib/jmap/client-interface';
import type { FileNode, FileNodeRights } from '@/lib/jmap/types';
import {
  FileProviderError,
  createFileProviderCapabilities,
  isFileProviderError,
  throwIfFileProviderAborted,
  unsupportedFileProviderOperation,
  type FileContent,
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
import type {
  FileCollaborationMetadata,
  FileCollaborationPermissions,
  FileCollaborationPrincipal,
  FileCollaborationService,
} from '@/lib/files/collaboration';

const JMAP_FILE_CAPABILITIES = createFileProviderCapabilities({
  browse: true,
  stat: true,
  download: true,
  upload: true,
  createDirectory: true,
  rename: true,
  move: true,
  copy: true,
  delete: true,
});

const NO_JMAP_FILE_CAPABILITIES = createFileProviderCapabilities();

function nodePermissions(node: FileNode): FileItemPermissions {
  const rights = node.myRights;
  const isDirectory = node.blobId == null;
  const mayRead = rights?.mayRead ?? true;
  const mayRename = rights?.mayRename ?? true;

  return Object.freeze({
    read: mayRead,
    download: !isDirectory && mayRead,
    addChildren: isDirectory && (rights?.mayAddChildren ?? true),
    modifyContent: !isDirectory && (rights?.mayModifyContent ?? true),
    rename: mayRename,
    move: mayRename,
    copy: mayRead,
    delete: rights?.mayDelete ?? true,
  });
}

export function jmapFileNodeToFileItem(node: FileNode): FileItem {
  const isDirectory = node.blobId == null;
  return Object.freeze({
    id: node.id,
    parentId: node.parentId ?? null,
    name: node.name,
    kind: isDirectory ? 'directory' : 'file',
    mediaType: isDirectory ? null : (node.type || 'application/octet-stream'),
    size: isDirectory ? null : (node.size ?? null),
    ...(node.created ? { createdAt: node.created } : {}),
    ...(node.updated ? { modifiedAt: node.updated } : {}),
    permissions: nodePermissions(node),
    ...(node.accountId || node.accountName
      ? {
          owner: {
            ...(node.accountId ? { id: node.accountId } : {}),
            ...(node.accountName ? { displayName: node.accountName } : {}),
          },
        }
      : {}),
    ...(node.isShared !== undefined ? { isShared: node.isShared } : {}),
  });
}

function collaborationPermissions(
  rights: FileNodeRights,
): FileCollaborationPermissions {
  return Object.freeze({
    read: rights.mayRead,
    addChildren: rights.mayAddChildren,
    rename: rights.mayRename,
    delete: rights.mayDelete,
    modifyContent: rights.mayModifyContent,
    manageSharing: rights.mayShare,
  });
}

function jmapRights(
  permissions: FileCollaborationPermissions,
): FileNodeRights {
  return {
    mayRead: permissions.read,
    mayAddChildren: permissions.addChildren,
    mayRename: permissions.rename,
    mayDelete: permissions.delete,
    mayModifyContent: permissions.modifyContent,
    mayShare: permissions.manageSharing,
  };
}

class JmapFileNodeCache {
  private readonly nodes = new Map<string, FileNode>();

  remember(nodes: readonly FileNode[]): void {
    for (const node of nodes) this.nodes.set(node.id, { ...node });
  }

  get(id: string): FileNode | undefined {
    const node = this.nodes.get(id);
    return node ? { ...node } : undefined;
  }

  patch(id: string, patch: Partial<FileNode>): FileNode | undefined {
    const node = this.nodes.get(id);
    if (!node) return undefined;
    const updated = { ...node, ...patch };
    this.nodes.set(id, updated);
    return { ...updated };
  }

  delete(id: string): void {
    this.nodes.delete(id);
  }
}

function normalizedErrorCode(message: string): {
  code: FileProviderErrorCode;
  retryable?: boolean;
} {
  if (/(not authenticated|unauthenticated|\b401\b)/i.test(message)) {
    return { code: 'not-authenticated' };
  }
  if (/(forbidden|permission|not authorized|authorization|\b403\b)/i.test(message)) {
    return { code: 'permission-denied' };
  }
  if (/(not found|notfound|\b404\b)/i.test(message)) {
    return { code: 'not-found' };
  }
  if (/(already exists|alreadyexists)/i.test(message)) {
    return { code: 'already-exists' };
  }
  if (/(conflict|\b409\b)/i.test(message)) {
    return { code: 'conflict' };
  }
  if (/(quota|overquota)/i.test(message)) {
    return { code: 'quota-exceeded' };
  }
  if (/(rate.?limit|\b429\b)/i.test(message)) {
    return { code: 'rate-limited', retryable: true };
  }
  if (/(too large|\b413\b)/i.test(message)) {
    return { code: 'too-large' };
  }
  if (/(network|offline|unavailable|timeout|timed out|\b5\d\d\b)/i.test(message)) {
    return { code: 'unavailable', retryable: true };
  }
  return { code: 'unknown' };
}

export function normalizeJmapFileError(
  error: unknown,
  operation: FileProviderOperation,
): FileProviderError {
  if (isFileProviderError(error)) return error;
  if (
    (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
  ) {
    return new FileProviderError('aborted', 'File operation was cancelled.', {
      cause: error,
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = normalizedErrorCode(message);
  return new FileProviderError(
    normalized.code,
    `JMAP file ${operation} failed.`,
    // Do not retain the raw transport error as `cause`: consumers commonly
    // log FileProviderError objects, and JMAP failures may contain private
    // URLs, response fragments, or authorization details.
    { retryable: normalized.retryable },
  );
}

function isCrossAccountItemId(id: string | null): boolean {
  return id != null && id.includes(':');
}

function cursorOffset(cursor?: string): number {
  if (!cursor) return 0;
  const match = /^jmap-offset:(\d+)$/.exec(cursor);
  if (!match) {
    throw new FileProviderError('invalid-request', 'Invalid continuation cursor.');
  }
  return Number(match[1]);
}

async function contentToBlob(
  content: FileContent,
  mediaType: string,
  signal?: AbortSignal,
): Promise<Blob> {
  throwIfFileProviderAborted(signal);
  if (content instanceof Blob) {
    return content.type || !mediaType
      ? content
      : content.slice(0, content.size, mediaType);
  }
  const blob = await new Response(content).blob();
  throwIfFileProviderAborted(signal);
  return blob.type || !mediaType ? blob : blob.slice(0, blob.size, mediaType);
}

export class JmapFileProvider implements FileProvider {
  readonly descriptor;

  constructor(
    private readonly client: IJMAPClient,
    private readonly cache = new JmapFileNodeCache(),
    descriptor: { id?: string; displayName?: string } = {},
  ) {
    this.descriptor = Object.freeze({
      id: descriptor.id ?? 'jmap-files',
      displayName: descriptor.displayName ?? 'JMAP Files',
    });
  }

  private async execute<T>(
    operation: FileProviderOperation,
    signal: AbortSignal | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      throwIfFileProviderAborted(signal);
      const supported = await this.client.probeFileNodeSupport();
      throwIfFileProviderAborted(signal);
      if (!supported) throw unsupportedFileProviderOperation(operation);
      const value = await action();
      throwIfFileProviderAborted(signal);
      return value;
    } catch (error) {
      throw normalizeJmapFileError(error, operation);
    }
  }

  private async resolveNode(id: string): Promise<FileNode> {
    const cached = this.cache.get(id);
    if (cached) return cached;
    if (isCrossAccountItemId(id)) {
      throw new FileProviderError('not-found', 'File item was not found.');
    }
    const nodes = await this.client.getFileNodes([id]);
    this.cache.remember(nodes);
    const node = nodes[0];
    if (!node) throw new FileProviderError('not-found', 'File item was not found.');
    return node;
  }

  async getCapabilities(options?: { signal?: AbortSignal }): Promise<FileProviderCapabilities> {
    try {
      throwIfFileProviderAborted(options?.signal);
      const supported = await this.client.probeFileNodeSupport();
      throwIfFileProviderAborted(options?.signal);
      return supported ? JMAP_FILE_CAPABILITIES : NO_JMAP_FILE_CAPABILITIES;
    } catch (error) {
      throw normalizeJmapFileError(error, 'browse');
    }
  }

  async list(request: FileListRequest): Promise<FileListPage> {
    return this.execute('browse', request.signal, async () => {
      const allNodes = isCrossAccountItemId(request.parentId)
        ? await this.client.listAllFileNodesAcrossAccounts()
        : await this.client.listAllFileNodes();
      this.cache.remember(allNodes);
      const children = allNodes
        .filter((node) => (node.parentId ?? null) === request.parentId)
        .map(jmapFileNodeToFileItem);
      const offset = cursorOffset(request.cursor);
      const limit = Math.max(1, request.limit ?? (children.length || 1));
      const items = children.slice(offset, offset + limit);
      const nextOffset = offset + items.length;
      return {
        items,
        nextCursor: nextOffset < children.length ? `jmap-offset:${nextOffset}` : null,
      };
    });
  }

  async stat(request: FileStatRequest): Promise<FileItem> {
    return this.execute('stat', request.signal, async () =>
      jmapFileNodeToFileItem(await this.resolveNode(request.itemId)));
  }

  async download(request: FileDownloadRequest): Promise<FileDownload> {
    return this.execute('download', request.signal, async () => {
      const node = await this.resolveNode(request.itemId);
      if (!node.blobId) {
        throw new FileProviderError('invalid-request', 'Directories cannot be downloaded.');
      }
      const mediaType = node.type || 'application/octet-stream';
      const body = await this.client.fetchBlob(
        node.blobId,
        node.name,
        mediaType,
        node.accountId,
      );
      return {
        body,
        fileName: node.name,
        mediaType,
        size: node.size ?? body.size,
        ...(node.updated ? { version: node.updated } : {}),
      };
    });
  }

  async upload(request: FileUploadRequest): Promise<FileItem> {
    return this.execute('upload', request.signal, async () => {
      const mediaType = request.mediaType || 'application/octet-stream';
      const blob = await contentToBlob(request.body, mediaType, request.signal);
      const file = new File([blob], request.name, { type: mediaType });
      const uploaded = await this.client.uploadBlob(file, {
        signal: request.signal,
        onProgress: request.onProgress
          ? (loaded, total) => request.onProgress?.({
              transferredBytes: loaded,
              totalBytes: total,
            })
          : undefined,
      });
      throwIfFileProviderAborted(request.signal);
      const node = await this.client.createFileNode(
        request.name,
        uploaded.blobId,
        uploaded.type || mediaType,
        request.size ?? uploaded.size ?? blob.size,
        request.parentId,
      );
      this.cache.remember([node]);
      return jmapFileNodeToFileItem(node);
    });
  }

  async createDirectory(request: FileCreateDirectoryRequest): Promise<FileItem> {
    return this.execute('createDirectory', request.signal, async () => {
      const node = await this.client.createFileDirectory(request.name, request.parentId);
      this.cache.remember([node]);
      return jmapFileNodeToFileItem(node);
    });
  }

  async rename(request: FileRenameRequest): Promise<FileItem> {
    return this.execute('rename', request.signal, async () => {
      await this.client.updateFileNode(request.itemId, { name: request.name });
      const node = this.cache.patch(request.itemId, { name: request.name })
        ?? await this.resolveNode(request.itemId);
      return jmapFileNodeToFileItem(node);
    });
  }

  async move(request: FileMoveRequest): Promise<FileItem> {
    return this.execute('move', request.signal, async () => {
      await this.client.updateFileNode(request.itemId, {
        parentId: request.destinationParentId,
      });
      const node = this.cache.patch(request.itemId, {
        parentId: request.destinationParentId,
      }) ?? await this.resolveNode(request.itemId);
      return jmapFileNodeToFileItem(node);
    });
  }

  async copy(request: FileCopyRequest): Promise<FileItem> {
    return this.execute('copy', request.signal, async () => {
      const source = await this.resolveNode(request.itemId);
      const node = await this.client.copyFileNode(
        request.itemId,
        request.name ?? source.name,
        request.destinationParentId,
      );
      this.cache.remember([node]);
      return jmapFileNodeToFileItem(node);
    });
  }

  async delete(request: FileDeleteRequest): Promise<void> {
    return this.execute('delete', request.signal, async () => {
      await this.client.destroyFileNodes([request.itemId]);
      this.cache.delete(request.itemId);
    });
  }
}

class JmapFileCollaborationService implements FileCollaborationService {
  readonly enabled: boolean;
  readonly ownPrincipalId: string | null;

  constructor(
    private readonly client: IJMAPClient,
    private readonly cache: JmapFileNodeCache,
  ) {
    this.enabled = client.supportsPrincipals();
    this.ownPrincipalId = client.getFilesAccountId() || null;
  }

  getMetadata(itemId: string): FileCollaborationMetadata | undefined {
    const node = this.cache.get(itemId);
    if (!node) return undefined;
    return {
      ...(node.myRights
        ? { ownPermissions: collaborationPermissions(node.myRights) }
        : {}),
      shares: node.shareWith
        ? Object.fromEntries(
            Object.entries(node.shareWith).map(([id, rights]) => [
              id,
              collaborationPermissions(rights),
            ]),
          )
        : node.shareWith,
    };
  }

  async listPrincipals(): Promise<readonly FileCollaborationPrincipal[]> {
    return this.client.getPrincipals();
  }

  async setShare(
    itemId: string,
    principalId: string,
    permissions: FileCollaborationPermissions | null,
  ): Promise<void> {
    await this.client.setFileNodeShare(
      itemId,
      principalId,
      permissions ? jmapRights(permissions) : null,
    );
    const node = this.cache.get(itemId);
    if (!node) return;
    const shareWith = { ...(node.shareWith ?? {}) };
    if (permissions) shareWith[principalId] = jmapRights(permissions);
    else delete shareWith[principalId];
    this.cache.patch(itemId, {
      shareWith: Object.keys(shareWith).length > 0 ? shareWith : null,
    });
  }

  async listSharedRoots(): Promise<readonly FileItem[]> {
    const nodes = await this.client.listAllFileNodesAcrossAccounts();
    this.cache.remember(nodes);
    const ids = new Set(nodes.map((node) => node.id));
    return nodes
      .filter((node) =>
        node.isShared && (node.parentId == null || !ids.has(node.parentId)))
      .map(jmapFileNodeToFileItem);
  }
}

export function createJmapFileServices(
  client: IJMAPClient,
  descriptor?: { id?: string; displayName?: string },
): {
  provider: JmapFileProvider;
  collaboration: FileCollaborationService;
} {
  const cache = new JmapFileNodeCache();
  return {
    provider: new JmapFileProvider(client, cache, descriptor),
    collaboration: new JmapFileCollaborationService(client, cache),
  };
}
