import type { IJMAPClient } from '@/lib/jmap/client-interface';
import {
  FileProviderError,
  isFileProviderError,
  throwIfFileProviderAborted,
  type FileListPage,
  type FileListRequest,
} from '@/lib/files/provider';
import {
  JmapFileProvider,
  normalizeJmapFileError,
} from '@/lib/files/jmap-provider';

export interface StoredEmailAttachment {
  readonly blobId: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export interface EmailAttachmentSource {
  list(request: FileListRequest): Promise<FileListPage>;
  resolve(
    itemIds: readonly string[],
    options?: { signal?: AbortSignal },
  ): Promise<readonly StoredEmailAttachment[]>;
}

/**
 * Bridges the provider-neutral file browser to JMAP email attachments.
 *
 * FileNode and blob identifiers stay inside this adapter. The picker sees only
 * FileItem values; the composer receives a blob reference only after the user
 * confirms the selection.
 */
export class JmapEmailAttachmentSource implements EmailAttachmentSource {
  private readonly provider: JmapFileProvider;

  constructor(private readonly client: IJMAPClient) {
    this.provider = new JmapFileProvider(client);
  }

  list(request: FileListRequest): Promise<FileListPage> {
    return this.provider.list(request);
  }

  async resolve(
    itemIds: readonly string[],
    options: { signal?: AbortSignal } = {},
  ): Promise<readonly StoredEmailAttachment[]> {
    try {
      throwIfFileProviderAborted(options.signal);
      const uniqueIds = [...new Set(itemIds)];
      if (uniqueIds.length === 0) return [];

      const nodes = await this.client.getFileNodes(uniqueIds);
      throwIfFileProviderAborted(options.signal);
      const nodesById = new Map(nodes.map((node) => [node.id, node]));

      return uniqueIds.map((itemId) => {
        const node = nodesById.get(itemId);
        if (!node) {
          throw new FileProviderError('not-found', 'Stored file was not found.');
        }
        if (!node.blobId) {
          throw new FileProviderError(
            'invalid-request',
            'Directories cannot be attached to an email.',
          );
        }
        if (node.myRights?.mayRead === false) {
          throw new FileProviderError(
            'permission-denied',
            'The stored file cannot be read.',
          );
        }
        return Object.freeze({
          blobId: node.blobId,
          name: node.name,
          type: node.type || 'application/octet-stream',
          size: Math.max(0, node.size ?? 0),
        });
      });
    } catch (error) {
      if (isFileProviderError(error)) throw error;
      throw normalizeJmapFileError(error, 'stat');
    }
  }
}
