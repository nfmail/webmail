import { create } from 'zustand';
import type {
  FileItem,
  FileItemPermissions,
  FileProvider,
  FileProviderCapabilities,
  FileProviderErrorCode,
} from '@/lib/files/provider';
import { isFileProviderError } from '@/lib/files/provider';
import type {
  FileCollaborationPermissions,
  FileCollaborationService,
} from '@/lib/files/collaboration';
import { createJmapFileServices } from '@/lib/files/jmap-provider';
import type { IJMAPClient } from '@/lib/jmap/client-interface';
import type { FileNode } from '@/lib/jmap/types';

export interface FileResource {
  id: string;
  name: string;
  serverName: string;
  isDirectory: boolean;
  contentType: string;
  contentLength: number;
  lastModified: string;
  parentId: string | null;
  permissions: FileItemPermissions;
  // Collaboration metadata stays separate from provider capabilities.
  collaborationPermissions?: FileCollaborationPermissions;
  shares?: Readonly<Record<string, FileCollaborationPermissions>> | null;
  isShared?: boolean;
  ownerAccountId?: string;
  ownerName?: string;
}

interface UploadProgress {
  name: string;
  loaded: number;
  total: number;
  current: number;
  totalFiles: number;
}

interface ClipboardState {
  mode: 'cut' | 'copy';
  ids: string[];
  names: string[];
  serverNames: string[];
  sourceParentId: string | null;
  sourcePath: string;
}

interface UndoAction {
  type: 'rename' | 'move';
  entries: {
    id: string;
    from: { name?: string; parentId?: string | null };
    to: { name?: string; parentId?: string | null };
  }[];
  sourceParentId: string | null;
}

interface FileState {
  currentParentId: string | null;
  currentPath: string;
  pathStack: { id: string | null; name: string }[];
  resources: FileResource[];
  isLoading: boolean;
  error: string | null;
  errorCode: FileProviderErrorCode | null;
  supportsFiles: boolean | null;
  capabilities: FileProviderCapabilities | null;
  selectedResources: Set<string>;
  uploadProgress: UploadProgress | null;
  /** Progress of the one-time legacy flat-node migration; null when idle. */
  migrationProgress: { current: number; total: number } | null;
  client: IJMAPClient | null;
  provider: FileProvider | null;
  collaboration: FileCollaborationService | null;
  /** Which connected account's files are being browsed. Pro shell only - null in single-account contexts. */
  currentAccountId: string | null;
  clipboard: ClipboardState | null;
  uploadAbortController: AbortController | null;
  favorites: string[];
  recentFiles: { name: string; id: string; timestamp: number }[];
  lastAction: UndoAction | null;
  /** Top-level FileNodes shared with the user by other principals ("Shared with me"). */
  sharedRoots: FileResource[];

  // Actions
  initProvider: (
    provider: FileProvider,
    options?: {
      accountId?: string | null;
      client?: IJMAPClient | null;
      collaboration?: FileCollaborationService | null;
    },
  ) => void;
  initClient: (client: IJMAPClient, accountId?: string | null) => void;
  /** Detach the current client and reset browse state. Used by the Pro shell to return to the cross-account picker. */
  clearClient: () => void;
  checkSupport: () => Promise<boolean>;
  /**
   * One-time upgrade of files created by older Bulwark builds, which encoded
   * the folder tree into flat node names with a Unicode separator. Reparents
   * those nodes into the real FileNode hierarchy. No-op once migrated.
   * Returns true if any node was migrated.
   */
  migrateLegacyFlatNodes: () => Promise<boolean>;
  navigate: (parentId: string | null, name?: string) => Promise<void>;
  navigateByPath: (path: string) => Promise<void>;
  navigateUp: () => Promise<void>;
  refresh: () => Promise<void>;
  createDirectory: (name: string) => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  uploadFolder: (files: File[]) => Promise<void>;
  cancelUpload: () => void;
  deleteResource: (name: string) => Promise<void>;
  deleteResources: (names: string[]) => Promise<void>;
  renameResource: (oldName: string, newName: string) => Promise<void>;
  downloadResource: (name: string) => Promise<void>;
  downloadResources: (names: string[]) => Promise<void>;
  getImageUrl: (name: string) => Promise<string>;
  getFileContent: (name: string) => Promise<{ blob: Blob; contentType: string }>;
  createTextFile: (name: string) => Promise<void>;
  duplicateResource: (name: string) => Promise<void>;
  moveToFolder: (names: string[], targetFolder: string) => Promise<void>;
  moveToParent: (names: string[]) => Promise<void>;
  cutResources: (names: string[]) => void;
  copyResources: (names: string[]) => void;
  pasteResources: () => Promise<void>;
  selectResource: (name: string | null) => void;
  toggleSelect: (name: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSelection: (names: Set<string>) => void;
  listPath: (path: string) => Promise<FileResource[]>;
  listByParentId: (parentId: string | null) => Promise<FileResource[]>;
  toggleFavorite: (path: string) => void;
  addRecentFile: (name: string, id: string) => void;
  undoLastAction: () => Promise<void>;
  /** Add, update (rights), or remove (rights=null) a principal's share on a node. */
  shareResource: (
    id: string,
    principalId: string,
    permissions: FileCollaborationPermissions | null,
  ) => Promise<void>;
  /** Load the top-level nodes shared with the user by other principals. */
  loadSharedRoots: () => Promise<void>;
}

const DIRECTORY_TYPES = new Set(['d', 'application/x-directory', 'text/directory', 'httpd/unix-directory', 'inode/directory']);

// Legacy builds encoded the folder hierarchy into flat node names using a path
// separator. Depending on the build / how the data was created (folder upload,
// WebDAV) this is either a plain "/" or the Unicode DIVISION SLASH (U+2215) that
// older webmail used to dodge Stalwart's "/" rejection. We accept both so the
// one-time migration into the real parentId hierarchy can't miss data (#379).
const LEGACY_PATH_SEPS = ['∕', '/', '⁄', '／'];

function lastLegacySepIndex(name: string): number {
  let idx = -1;
  for (const sep of LEGACY_PATH_SEPS) {
    const i = name.lastIndexOf(sep);
    if (i > idx) idx = i;
  }
  return idx;
}

// Whether an old build's `type` marks a node as a directory. Only meaningful for
// detecting legacy "folder" nodes that were really stored as 0-byte files; it is
// NOT how a real folder is identified (see isFolder).
function isDirectoryType(type: string | undefined): boolean {
  if (!type) return false;
  return DIRECTORY_TYPES.has(type) || type.includes('directory');
}

// A FileNode is a folder iff it has no content blob. This is the authoritative
// signal in the JMAP FileNode spec and in Stalwart (a node is a container when
// its `file`/`blobId` is null); a `type` of "d" is not — older builds created
// "folders" as blob-backed files, which can't hold children (#379).
function isFolder(node: Pick<FileNode, 'blobId'>): boolean {
  return node.blobId == null;
}

function itemToResource(
  item: FileItem,
  collaboration?: FileCollaborationService | null,
): FileResource {
  const metadata = collaboration?.getMetadata(item.id);
  const isDir = item.kind === 'directory';
  return {
    id: item.id,
    name: item.name,
    serverName: item.name,
    isDirectory: isDir,
    contentType: item.mediaType ?? '',
    contentLength: item.size ?? 0,
    lastModified: item.modifiedAt ?? item.createdAt ?? '',
    parentId: item.parentId,
    permissions: item.permissions,
    collaborationPermissions: metadata?.ownPermissions,
    shares: metadata?.shares,
    isShared: item.isShared,
    ownerAccountId: item.owner?.id,
    ownerName: item.owner?.displayName,
  };
}

function sortResources(resources: FileResource[]): FileResource[] {
  // Directories first, then alphabetically.
  return resources.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Resolve a display path (e.g. "/Documents/Notes") to a FileNode id by walking
// the hierarchy from the root. Returns null for the root, or undefined if any
// segment can't be found.
async function resolvePathToId(
  provider: FileProvider,
  path: string,
): Promise<string | null | undefined> {
  if (path === '/' || path === '') return null;
  const segments = path.split('/').filter(Boolean);
  let parentId: string | null = null;
  for (const segment of segments) {
    const page = await provider.list({ parentId });
    const match = page.items.find(
      (item) => item.name === segment && item.kind === 'directory',
    );
    if (!match) return undefined;
    parentId = match.id;
  }
  return parentId;
}

async function fileContentToBlob(
  content: Blob | ReadableStream<Uint8Array>,
  mediaType?: string,
): Promise<Blob> {
  if (content instanceof Blob) return content;
  const blob = await new Response(content).blob();
  return blob.type || !mediaType ? blob : blob.slice(0, blob.size, mediaType);
}

async function downloadToBrowser(
  body: Blob | ReadableStream<Uint8Array>,
  fileName: string,
  mediaType: string,
): Promise<void> {
  const blob = await fileContentToBlob(body, mediaType);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getUniqueName(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name;
  const dotIndex = name.lastIndexOf('.');
  const base = dotIndex > 0 ? name.substring(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.substring(dotIndex) : '';
  let counter = 1;
  while (existingNames.has(`${base} (${counter})${ext}`)) counter++;
  return `${base} (${counter})${ext}`;
}

function buildPathFromStack(stack: { id: string | null; name: string }[]): string {
  if (stack.length <= 1) return '/';
  return '/' + stack.slice(1).map(s => s.name).join('/');
}

export const useFileStore = create<FileState>((set, get) => ({
  currentParentId: null,
  currentPath: '/',
  pathStack: [{ id: null, name: '' }],
  resources: [],
  isLoading: false,
  error: null,
  errorCode: null,
  supportsFiles: null,
  capabilities: null,
  selectedResources: new Set<string>(),
  uploadProgress: null,
  migrationProgress: null,
  client: null,
  provider: null,
  collaboration: null,
  currentAccountId: null,
  clipboard: null,
  uploadAbortController: null,
  lastAction: null,
  sharedRoots: [],
  favorites: (() => {
    try { return JSON.parse(localStorage.getItem('files-favorites') || '[]'); } catch { return []; }
  })(),
  recentFiles: (() => {
    try { return JSON.parse(localStorage.getItem('files-recent-files') || '[]'); } catch { return []; }
  })(),

  initProvider: (provider, options = {}) => {
    set({
      provider,
      client: options.client ?? null,
      collaboration: options.collaboration ?? null,
      currentAccountId: options.accountId ?? null,
      supportsFiles: null,
      capabilities: null,
      pathStack: [{ id: null, name: '' }],
      currentPath: '/',
      currentParentId: null,
      resources: [],
      selectedResources: new Set<string>(),
      clipboard: null,
      error: null,
      errorCode: null,
      isLoading: false,
    });
  },

  initClient: (client: IJMAPClient, accountId?: string | null) => {
    const services = createJmapFileServices(client, {
      id: accountId ? `jmap-files:${accountId}` : 'jmap-files',
    });
    get().initProvider(services.provider, {
      accountId,
      client,
      collaboration: services.collaboration,
    });
  },

  clearClient: () => {
    set({
      client: null,
      provider: null,
      collaboration: null,
      currentAccountId: null,
      supportsFiles: null,
      capabilities: null,
      pathStack: [{ id: null, name: '' }],
      currentPath: '/',
      currentParentId: null,
      resources: [],
      selectedResources: new Set<string>(),
      error: null,
      errorCode: null,
      isLoading: false,
    });
  },

  checkSupport: async () => {
    const { client, provider } = get();
    if (!provider) {
      set({ supportsFiles: false, capabilities: null });
      return false;
    }
    set({ isLoading: true, error: null, errorCode: null });
    try {
      const capabilities = await provider.getCapabilities();
      const supported = capabilities.browse;
      if (!supported && client) {
        console.warn('[Files] JMAP FileNode not supported. Available capabilities:', Object.keys(client.getCapabilities()));
      }
      set({ supportsFiles: supported, capabilities, isLoading: false });
      return supported;
    } catch (error) {
      set({
        supportsFiles: false,
        capabilities: null,
        error: error instanceof Error ? error.message : 'Failed to check file provider',
        errorCode: isFileProviderError(error) ? error.code : 'unknown',
        isLoading: false,
      });
      return false;
    }
  },

  migrateLegacyFlatNodes: async () => {
    const { client } = get();
    if (!client) return false;

    let allNodes: FileNode[];
    try {
      allNodes = await client.listAllFileNodes();
    } catch {
      return false;
    }

    // Split an encoded name into its real path segments, accepting any of the
    // legacy separators and dropping empty segments (leading / trailing / dup
    // separators). A non-legacy name yields a single segment.
    const splitSegments = (name: string): string[] => {
      let parts = [name];
      for (const sep of LEGACY_PATH_SEPS) parts = parts.flatMap(p => p.split(sep));
      return parts.filter(Boolean);
    };

    // A legacy "folder marker": an old build stored folders as 0-byte files with
    // a directory-ish `type` and a blob. The server treats these as files, so
    // nothing can be parented under them - they must be replaced by real folders.
    const isLegacyDirMarker = (n: FileNode) => !isFolder(n) && isDirectoryType(n.type);

    const legacy = allNodes.filter(n => lastLegacySepIndex(n.name) >= 0);
    const markers = allNodes.filter(isLegacyDirMarker);
    if (legacy.length === 0 && markers.length === 0) return false;

    // Real folders that already exist, indexed by the canonical path they
    // represent, so we reuse them instead of creating duplicates. Keying on the
    // JSON-encoded segment array avoids separator-collisions between levels.
    const pathKey = (segs: string[]) => JSON.stringify(segs);
    const existingDirByPath = new Map<string, FileNode>();
    for (const n of allNodes) {
      if (!isFolder(n)) continue;
      const segs = splitSegments(n.name);
      if (segs.length > 0) existingDirByPath.set(pathKey(segs), n);
    }

    // Per-node rename+reparent operations to apply. Crucially, every parentId
    // here points at a node we have already ensured is a real folder, so the
    // server's "parent must be a folder" check can't reject them (#379).
    const updates: Record<string, { name: string; parentId: string | null }> = {};
    const dirIdByPath = new Map<string, string | null>();
    dirIdByPath.set('', null); // root
    let skipped = 0;
    let createdDirs = 0;
    let creationBroken = false;

    // Ensure a real folder exists for the given path, returning its id. Reuses an
    // existing folder at that path (scheduling it for rename/reparent into the
    // real hierarchy) or creates a fresh one. Sequential because a create hits
    // the server and deeper levels depend on its id.
    const ensureDir = async (segs: string[]): Promise<string | null> => {
      if (segs.length === 0) return null;
      const key = pathKey(segs);
      if (dirIdByPath.has(key)) return dirIdByPath.get(key)!;
      const parentId = await ensureDir(segs.slice(0, -1));
      const leaf = segs[segs.length - 1];
      const existing = existingDirByPath.get(key);
      if (existing) {
        // Reuse it; only rewrite if its name/parent isn't already correct.
        if (existing.name !== leaf || (existing.parentId ?? null) !== parentId) {
          updates[existing.id] = { name: leaf, parentId };
        }
        dirIdByPath.set(key, existing.id);
        return existing.id;
      }
      const created = await client.createFileDirectory(leaf, parentId);
      // Safety net: a real folder has no content blob. If the server (or a stale
      // build of createFileDirectory) hands back a blob-backed node, it is NOT a
      // folder - abort before we delete anything irreversible (see below).
      if (created.blobId != null) {
        creationBroken = true;
        throw new Error('createFileDirectory returned a non-folder (has a blobId)');
      }
      createdDirs++;
      dirIdByPath.set(key, created.id);
      return created.id;
    };

    const placeDir = async (segs: string[], label: string) => {
      try {
        await ensureDir(segs);
      } catch (err) {
        skipped++;
        if (!creationBroken) console.warn('[Files] migration: could not create folder', JSON.stringify(label), '→', err instanceof Error ? err.message : String(err));
      }
    };

    // Move the legacy marker files out of the way (a reversible rename) so their
    // names are free for the real folders created in their place. They are only
    // DELETED at the very end, once the real hierarchy is safely in place - so a
    // failure can never leave a folder both gone and not recreated.
    const renamedMarkers: { id: string; name: string }[] = [];
    for (const m of markers) {
      try {
        await client.updateFileNode(m.id, { name: `__bulwark_migrating__.${m.id}` });
        renamedMarkers.push({ id: m.id, name: m.name });
      } catch (err) {
        console.warn('[Files] migration: could not set aside marker', JSON.stringify(m.name), '→', err instanceof Error ? err.message : String(err));
      }
    }

    // Recreate folders that existed only as markers, reparent any real folders
    // that still carry an encoded name, then reparent the content files.
    for (const m of markers) {
      const segs = splitSegments(m.name);
      if (segs.length > 0) await placeDir(segs, m.name);
    }
    for (const node of legacy) {
      if (!isFolder(node) || isLegacyDirMarker(node)) continue;
      const segs = splitSegments(node.name);
      if (segs.length > 0) await placeDir(segs, node.name);
    }
    for (const node of legacy) {
      if (isFolder(node) || isLegacyDirMarker(node)) continue;
      const segs = splitSegments(node.name);
      if (segs.length === 0) { skipped++; continue; }
      try {
        const parentId = await ensureDir(segs.slice(0, -1));
        updates[node.id] = { name: segs[segs.length - 1], parentId };
      } catch (err) {
        skipped++;
        if (!creationBroken) console.warn('[Files] migration: could not place', JSON.stringify(node.name), '→', err instanceof Error ? err.message : String(err));
      }
    }

    // If folder creation is fundamentally broken, restore the markers we set
    // aside and bail out without deleting or reparenting anything. No data lost.
    if (creationBroken) {
      console.error('[Files] migration aborted: the server did not return real folders ' +
        '(createFileDirectory produced blob-backed nodes). Restoring markers; nothing was deleted.');
      for (const m of renamedMarkers) {
        try { await client.updateFileNode(m.id, { name: m.name }); } catch { /* best effort */ }
      }
      set({ migrationProgress: null });
      return false;
    }

    const updateIds = Object.keys(updates);
    set({ migrationProgress: { current: 0, total: updateIds.length } });

    let migrated = 0;
    let firstError: string | null = null;
    const CHUNK = 100;
    try {
      for (let i = 0; i < updateIds.length; i += CHUNK) {
        const slice = updateIds.slice(i, i + CHUNK);
        const batch: Record<string, { name: string; parentId: string | null }> = {};
        for (const id of slice) batch[id] = updates[id];
        try {
          const { updated, notUpdated } = await client.updateFileNodes(batch);
          migrated += updated.length;
          const failedIds = Object.keys(notUpdated);
          if (failedIds.length > 0 && !firstError) firstError = notUpdated[failedIds[0]];
          for (const id of failedIds) {
            console.error('[Files] migration: server rejected node', id, '→', notUpdated[id]);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!firstError) firstError = msg;
          console.error('[Files] migration: batch failed →', msg);
        }
        set({ migrationProgress: { current: Math.min(i + CHUNK, updateIds.length), total: updateIds.length } });
      }
    } finally {
      set({ migrationProgress: null });
    }

    // The real hierarchy is now in place, so the set-aside marker files are empty
    // and safe to delete. Done last, on purpose: until here nothing irreversible
    // has happened.
    let removedMarkers = 0;
    if (renamedMarkers.length > 0) {
      try {
        const { destroyed } = await client.destroyFileNodes(renamedMarkers.map(m => m.id));
        removedMarkers = destroyed.length;
      } catch (err) {
        console.warn('[Files] migration: could not remove emptied markers →', err instanceof Error ? err.message : String(err));
      }
    }

    const didWork = migrated > 0 || createdDirs > 0 || removedMarkers > 0;
    if (!didWork && (legacy.length > 0 || markers.length > 0)) {
      console.error(`[Files] migration found ${legacy.length} legacy node(s) but changed nothing ` +
        `(skipped ${skipped}, first error: ${firstError ?? 'none'}).`);
    } else if (didWork) {
      console.info(`[Files] migration reparented ${migrated} file(s), created ${createdDirs} folder(s), ` +
        `removed ${removedMarkers} legacy marker(s) (skipped ${skipped}).`);
    }
    return didWork;
  },

  navigate: async (parentId: string | null, name?: string) => {
    const { provider, collaboration, pathStack } = get();
    if (!provider) return;

    set({
      isLoading: true,
      error: null,
      errorCode: null,
      currentParentId: parentId,
      selectedResources: new Set(),
    });

    // Update path stack
    let newStack: { id: string | null; name: string }[];
    if (parentId === null) {
      newStack = [{ id: null, name: '' }];
    } else {
      // Check if navigating to a parent in the stack
      const existingIdx = pathStack.findIndex(s => s.id === parentId);
      if (existingIdx >= 0) {
        newStack = pathStack.slice(0, existingIdx + 1);
      } else {
        newStack = [...pathStack, { id: parentId, name: name || parentId }];
      }
    }

    const newPath = buildPathFromStack(newStack);
    set({ pathStack: newStack, currentPath: newPath });

    try { localStorage.setItem('files-last-parent-id', parentId || ''); } catch { /* ignore */ }
    try { localStorage.setItem('files-path-stack', JSON.stringify(newStack)); } catch { /* ignore */ }

    try {
      const page = await provider.list({ parentId });
      const resources = sortResources(
        page.items.map((item) => itemToResource(item, collaboration)),
      );

      // Prune recent files whose backing item no longer exists. The JMAP
      // adapter resolves these from the listing cache, while other providers
      // may use their native metadata operation.
      const { recentFiles } = get();
      const existence = await Promise.all(
        recentFiles.map(async (recent) => {
          try {
            await provider.stat({ itemId: recent.id });
            return true;
          } catch {
            return false;
          }
        }),
      );
      const prunedRecent = recentFiles.filter((_, index) => existence[index]);
      if (prunedRecent.length !== recentFiles.length) {
        try { localStorage.setItem('files-recent-files', JSON.stringify(prunedRecent)); } catch { /* ignore */ }
        set({ resources, recentFiles: prunedRecent, isLoading: false });
      } else {
        set({ resources, isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to list directory',
        errorCode: isFileProviderError(error) ? error.code : 'unknown',
        isLoading: false,
        resources: [],
      });
    }
  },

  navigateByPath: async (path: string) => {
    const { pathStack, navigate } = get();
    if (path === '/') {
      await navigate(null);
      return;
    }
    // Try to match the path against the current pathStack
    const segments = path.split('/').filter(Boolean);
    const targetDepth = segments.length;
    // pathStack[0] is root (id: null, name: ''), subsequent entries match path segments
    if (targetDepth < pathStack.length) {
      const entry = pathStack[targetDepth];
      // Verify the names match
      const stackPath = pathStack.slice(1, targetDepth + 1).map(s => s.name).join('/');
      if (stackPath === segments.join('/')) {
        await navigate(entry.id, entry.name);
        return;
      }
    }
    // Fallback: resolve the path against the live hierarchy (covers favorites
    // and recent paths outside the current breadcrumb stack).
    const { provider } = get();
    if (provider) {
      try {
        const id = await resolvePathToId(provider, path);
        if (id !== undefined) {
          await navigate(id, segments[segments.length - 1]);
        }
      } catch { /* ignore */ }
    }
  },

  navigateUp: async () => {
    const { pathStack, navigate } = get();
    if (pathStack.length <= 1) return;
    const parent = pathStack[pathStack.length - 2];
    await navigate(parent.id, parent.name);
  },

  refresh: async () => {
    const { currentParentId, navigate, pathStack } = get();
    const currentEntry = pathStack[pathStack.length - 1];
    await navigate(currentParentId, currentEntry?.name);
  },

  createDirectory: async (name: string) => {
    const { provider, currentParentId, refresh } = get();
    if (!provider) return;

    await provider.createDirectory({ name, parentId: currentParentId });
    await refresh();
  },

  uploadFile: async (file: File) => {
    const { provider, currentParentId } = get();
    if (!provider) return;

    const abortController = new AbortController();
    set({ uploadAbortController: abortController });
    set({ uploadProgress: { name: file.name, loaded: 0, total: file.size, current: 1, totalFiles: 1 } });

    try {
      if (abortController.signal.aborted) return;
      await provider.upload({
        parentId: currentParentId,
        name: file.name,
        body: file,
        mediaType: file.type || 'application/octet-stream',
        size: file.size,
        signal: abortController.signal,
        onProgress: ({ transferredBytes, totalBytes }) => {
          set({
            uploadProgress: {
              name: file.name,
              loaded: transferredBytes,
              total: totalBytes ?? file.size,
              current: 1,
              totalFiles: 1,
            },
          });
        },
      });
      if (abortController.signal.aborted) return;
      set({ uploadProgress: { name: file.name, loaded: file.size, total: file.size, current: 1, totalFiles: 1 } });
    } finally {
      set({ uploadProgress: null, uploadAbortController: null });
    }
  },

  uploadFiles: async (files: File[]) => {
    const { provider, currentParentId, resources } = get();
    if (!provider) return;

    const abortController = new AbortController();
    set({ uploadAbortController: abortController });
    const totalFiles = files.length;
    const existingNames = new Set(resources.map(r => r.name));

    for (let i = 0; i < files.length; i++) {
      if (abortController.signal.aborted) break;
      const file = files[i];
      const uniqueName = getUniqueName(file.name, existingNames);
      existingNames.add(uniqueName);
      set({ uploadProgress: { name: file.name, loaded: 0, total: file.size, current: i + 1, totalFiles } });

      try {
        const idx = i;
        await provider.upload({
          parentId: currentParentId,
          name: uniqueName,
          body: file,
          mediaType: file.type || 'application/octet-stream',
          size: file.size,
          signal: abortController.signal,
          onProgress: ({ transferredBytes, totalBytes }) => {
            set({
              uploadProgress: {
                name: file.name,
                loaded: transferredBytes,
                total: totalBytes ?? file.size,
                current: idx + 1,
                totalFiles,
              },
            });
          },
        });
        if (abortController.signal.aborted) break;
        set({ uploadProgress: { name: file.name, loaded: file.size, total: file.size, current: i + 1, totalFiles } });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') break;
        set({ uploadProgress: null, uploadAbortController: null });
        throw err;
      }
    }
    set({ uploadProgress: null, uploadAbortController: null });
    await get().refresh();
  },

  cancelUpload: () => {
    const { uploadAbortController } = get();
    if (uploadAbortController) {
      uploadAbortController.abort();
      set({ uploadProgress: null, uploadAbortController: null });
    }
  },

  uploadFolder: async (files: File[]) => {
    const { provider, currentParentId } = get();
    if (!provider || files.length === 0) return;

    const abortController = new AbortController();
    set({ uploadAbortController: abortController });
    const totalFiles = files.length;

    // Collect unique directory paths (relative to the dropped folder) and
    // create them as real nested directories, mapping each path to its node id.
    const dirs = new Set<string>();
    for (const file of files) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = relativePath.split('/');
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    }

    // Map a directory path to its created node id. Root ('') maps to the
    // current folder we are uploading into.
    const dirIds = new Map<string, string | null>();
    dirIds.set('', currentParentId);

    const sortedDirs = [...dirs].sort((a, b) => a.split('/').length - b.split('/').length);
    for (const dir of sortedDirs) {
      if (abortController.signal.aborted) break;
      const slash = dir.lastIndexOf('/');
      const parentPath = slash >= 0 ? dir.slice(0, slash) : '';
      const dirName = slash >= 0 ? dir.slice(slash + 1) : dir;
      const parentId = dirIds.get(parentPath) ?? currentParentId;
      try {
        const created = await provider.createDirectory({
          name: dirName,
          parentId,
          signal: abortController.signal,
        });
        dirIds.set(dir, created.id);
      } catch {
        // Directory may already exist - leave it unmapped; files fall back to
        // the closest known parent below.
      }
    }

    // Upload files into their containing directory.
    for (let i = 0; i < files.length; i++) {
      if (abortController.signal.aborted) break;
      const file = files[i];
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const slash = relativePath.lastIndexOf('/');
      const dirPath = slash >= 0 ? relativePath.slice(0, slash) : '';
      const parentId = dirIds.get(dirPath) ?? currentParentId;

      set({ uploadProgress: { name: relativePath, loaded: 0, total: file.size, current: i + 1, totalFiles } });

      try {
        await provider.upload({
          parentId,
          name: file.name,
          body: file,
          mediaType: file.type || 'application/octet-stream',
          size: file.size,
          signal: abortController.signal,
        });
        set({ uploadProgress: { name: relativePath, loaded: file.size, total: file.size, current: i + 1, totalFiles } });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') break;
        set({ uploadProgress: null, uploadAbortController: null });
        throw err;
      }
    }
    set({ uploadProgress: null, uploadAbortController: null });
    await get().refresh();
  },

  deleteResource: async (name: string) => {
    const { provider, resources, recentFiles, refresh } = get();
    if (!provider) return;

    const resource = resources.find(r => r.name === name);
    if (!resource) return;

    await provider.delete({ itemId: resource.id });
    const nextRecentFiles = recentFiles.filter(r => r.id !== resource.id);
    set({ recentFiles: nextRecentFiles });
    try { localStorage.setItem('files-recent-files', JSON.stringify(nextRecentFiles)); } catch { /* ignore */ }
    await refresh();
  },

  deleteResources: async (names: string[]) => {
    const { provider, resources, recentFiles, refresh } = get();
    if (!provider) return;

    const idsToDelete: string[] = [];
    for (const name of names) {
      const resource = resources.find(r => r.name === name);
      if (resource) idsToDelete.push(resource.id);
    }

    if (idsToDelete.length === 0) return;

    for (const itemId of idsToDelete) {
      await provider.delete({ itemId });
    }
    const deletedIdSet = new Set(idsToDelete);
    const nextRecentFiles = recentFiles.filter(r => !deletedIdSet.has(r.id));
    set({ selectedResources: new Set() });
    set({ recentFiles: nextRecentFiles });
    try { localStorage.setItem('files-recent-files', JSON.stringify(nextRecentFiles)); } catch { /* ignore */ }
    await refresh();
  },

  renameResource: async (oldName: string, newName: string) => {
    const { provider, resources, refresh } = get();
    if (!provider) return;

    const resource = resources.find(r => r.name === oldName);
    if (!resource) return;

    await provider.rename({ itemId: resource.id, name: newName });

    set({
      lastAction: {
        type: 'rename',
        entries: [{ id: resource.id, from: { name: oldName }, to: { name: newName } }],
        sourceParentId: null,
      },
    });
    await refresh();
  },

  downloadResource: async (name: string) => {
    const { provider, resources } = get();
    if (!provider) return;

    const resource = resources.find(r => r.name === name);
    if (!resource || resource.isDirectory) return;

    const download = await provider.download({ itemId: resource.id });
    await downloadToBrowser(
      download.body,
      download.fileName,
      download.mediaType,
    );
  },

  downloadResources: async (names: string[]) => {
    const { downloadResource } = get();
    for (const name of names) {
      await downloadResource(name);
    }
  },

  getImageUrl: async (name: string) => {
    const { provider, resources } = get();
    if (!provider) throw new Error('No file provider');

    const resource = resources.find(r => r.name === name);
    if (!resource || resource.isDirectory) throw new Error('No file content');

    const download = await provider.download({ itemId: resource.id });
    const blob = await fileContentToBlob(download.body, download.mediaType);
    return URL.createObjectURL(blob);
  },

  getFileContent: async (name: string) => {
    const { provider, resources } = get();
    if (!provider) throw new Error('No file provider');

    const resource = resources.find(r => r.name === name);
    if (!resource || resource.isDirectory) throw new Error('No file content');

    const download = await provider.download({ itemId: resource.id });
    const blob = await fileContentToBlob(download.body, download.mediaType);
    return { blob, contentType: download.mediaType };
  },

  createTextFile: async (name: string) => {
    const { provider, currentParentId, refresh } = get();
    if (!provider) return;

    await provider.upload({
      parentId: currentParentId,
      name,
      body: new Blob([''], { type: 'text/plain' }),
      mediaType: 'text/plain',
      size: 0,
    });
    await refresh();
  },

  duplicateResource: async (name: string) => {
    const { provider, resources, currentParentId, refresh } = get();
    if (!provider) return;

    const resource = resources.find(r => r.name === name);
    if (!resource) return;

    const dotIdx = name.lastIndexOf('.');
    const copyName = dotIdx > 0
      ? `${name.substring(0, dotIdx)} (copy)${name.substring(dotIdx)}`
      : `${name} (copy)`;

    await provider.copy({
      itemId: resource.id,
      name: copyName,
      destinationParentId: currentParentId,
    });
    await refresh();
  },

  moveToFolder: async (names: string[], targetFolder: string) => {
    const { provider, resources, refresh } = get();
    if (!provider) return;

    const targetResource = resources.find(r => r.name === targetFolder && r.isDirectory);
    if (!targetResource) return;

    const entries: UndoAction['entries'] = [];
    for (const name of names) {
      const resource = resources.find(r => r.name === name);
      if (!resource || resource.id === targetResource.id) continue;
      await provider.move({
        itemId: resource.id,
        destinationParentId: targetResource.id,
      });
      entries.push({ id: resource.id, from: { parentId: resource.parentId }, to: { parentId: targetResource.id } });
    }
    set({
      selectedResources: new Set(),
      lastAction: { type: 'move', entries, sourceParentId: null },
    });
    await refresh();
  },

  moveToParent: async (names: string[]) => {
    const { provider, resources, pathStack, refresh } = get();
    if (!provider || pathStack.length <= 1) return;

    // Move into the grandparent of the current folder's contents, i.e. the
    // entry one level up in the breadcrumb stack.
    const newParentId = pathStack[pathStack.length - 2].id;

    const entries: UndoAction['entries'] = [];
    for (const name of names) {
      const resource = resources.find(r => r.name === name);
      if (!resource) continue;
      await provider.move({
        itemId: resource.id,
        destinationParentId: newParentId,
      });
      entries.push({ id: resource.id, from: { parentId: resource.parentId }, to: { parentId: newParentId } });
    }
    set({
      selectedResources: new Set(),
      lastAction: { type: 'move', entries, sourceParentId: null },
    });
    await refresh();
  },

  cutResources: (names: string[]) => {
    const { currentPath, currentParentId, resources } = get();
    const ids = names.map(n => resources.find(r => r.name === n)?.id).filter(Boolean) as string[];
    const serverNames = names.map(n => resources.find(r => r.name === n)?.serverName).filter(Boolean) as string[];
    set({ clipboard: { mode: 'cut', ids, names, serverNames, sourceParentId: currentParentId, sourcePath: currentPath } });
  },

  copyResources: (names: string[]) => {
    const { currentPath, currentParentId, resources } = get();
    const ids = names.map(n => resources.find(r => r.name === n)?.id).filter(Boolean) as string[];
    const serverNames = names.map(n => resources.find(r => r.name === n)?.serverName).filter(Boolean) as string[];
    set({ clipboard: { mode: 'copy', ids, names, serverNames, sourceParentId: currentParentId, sourcePath: currentPath } });
  },

  pasteResources: async () => {
    const { provider, currentParentId, clipboard, refresh } = get();
    if (!provider || !clipboard) return;

    const entries: UndoAction['entries'] = [];

    for (let i = 0; i < clipboard.ids.length; i++) {
      const id = clipboard.ids[i];
      const displayName = clipboard.names[i];

      if (clipboard.mode === 'cut') {
        await provider.move({ itemId: id, destinationParentId: currentParentId });
        entries.push({ id, from: { parentId: clipboard.sourceParentId }, to: { parentId: currentParentId } });
      } else {
        await provider.copy({
          itemId: id,
          name: displayName,
          destinationParentId: currentParentId,
        });
      }
    }

    if (clipboard.mode === 'cut') {
      set({
        clipboard: null,
        lastAction: { type: 'move', entries, sourceParentId: null },
      });
    }
    await refresh();
  },

  selectResource: (name: string | null) => {
    set({ selectedResources: name ? new Set([name]) : new Set() });
  },

  toggleSelect: (name: string) => {
    const { selectedResources } = get();
    const next = new Set(selectedResources);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    set({ selectedResources: next });
  },

  selectAll: () => {
    const { resources } = get();
    set({ selectedResources: new Set(resources.map(r => r.name)) });
  },

  clearSelection: () => {
    set({ selectedResources: new Set() });
  },

  setSelection: (names: Set<string>) => {
    set({ selectedResources: new Set(names) });
  },

  listPath: async (path: string) => {
    const { provider, collaboration } = get();
    if (!provider) return [];

    try {
      const parentId = await resolvePathToId(provider, path);
      if (parentId === undefined) return [];
      const page = await provider.list({ parentId });
      return sortResources(
        page.items.map((item) => itemToResource(item, collaboration)),
      );
    } catch {
      return [];
    }
  },

  listByParentId: async (parentId: string | null) => {
    const { provider, collaboration } = get();
    if (!provider) return [];
    try {
      const page = await provider.list({ parentId });
      return sortResources(
        page.items.map((item) => itemToResource(item, collaboration)),
      );
    } catch {
      return [];
    }
  },

  toggleFavorite: (path: string) => {
    const { favorites } = get();
    const next = favorites.includes(path)
      ? favorites.filter(f => f !== path)
      : [...favorites, path];
    set({ favorites: next });
    try { localStorage.setItem('files-favorites', JSON.stringify(next)); } catch { /* ignore */ }
  },

  addRecentFile: (name: string, id: string) => {
    const { recentFiles } = get();
    const entry = { name, id, timestamp: Date.now() };
    const filtered = recentFiles.filter(r => r.id !== id);
    const next = [entry, ...filtered].slice(0, 20);
    set({ recentFiles: next });
    try { localStorage.setItem('files-recent-files', JSON.stringify(next)); } catch { /* ignore */ }
  },

  undoLastAction: async () => {
    const { provider, lastAction, refresh } = get();
    if (!provider || !lastAction) return;

    for (const entry of lastAction.entries) {
      if (entry.from.name !== undefined) {
        await provider.rename({ itemId: entry.id, name: entry.from.name });
      }
      if (entry.from.parentId !== undefined) {
        await provider.move({
          itemId: entry.id,
          destinationParentId: entry.from.parentId,
        });
      }
    }
    set({ lastAction: null });
    await refresh();
  },

  shareResource: async (id, principalId, permissions) => {
    const { collaboration, refresh } = get();
    if (!collaboration) return;
    await collaboration.setShare(id, principalId, permissions);
    await refresh();
  },

  loadSharedRoots: async () => {
    const { collaboration } = get();
    if (!collaboration) {
      set({ sharedRoots: [] });
      return;
    }
    try {
      const roots = await collaboration.listSharedRoots();
      set({
        sharedRoots: sortResources(
          roots.map((item) => itemToResource(item, collaboration)),
        ),
      });
    } catch (error) {
      console.error('[Files] Failed to load shared roots:', error);
      set({ sharedRoots: [] });
    }
  },
}));
