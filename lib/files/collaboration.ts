import type { FileItem } from '@/lib/files/provider';

/**
 * Provider-neutral collaboration rights for file items.
 *
 * These are domain permissions, not aliases for a transport's rights object.
 * Adapters translate their native representation at the boundary.
 */
export interface FileCollaborationPermissions {
  readonly read: boolean;
  readonly addChildren: boolean;
  readonly rename: boolean;
  readonly delete: boolean;
  readonly modifyContent: boolean;
  readonly manageSharing: boolean;
}

export interface FileCollaborationPrincipal {
  readonly id: string;
  readonly type: 'individual' | 'group' | 'resource' | 'location' | 'other';
  readonly name: string;
  readonly description?: string | null;
  readonly email?: string | null;
}

export interface FileCollaborationMetadata {
  readonly ownPermissions?: FileCollaborationPermissions;
  readonly shares?: Readonly<Record<string, FileCollaborationPermissions>> | null;
}

/**
 * Collaboration stays separate from the base FileProvider contract so
 * providers without principal sharing do not have to emulate JMAP semantics.
 */
export interface FileCollaborationService {
  readonly enabled: boolean;
  readonly ownPrincipalId: string | null;

  getMetadata(itemId: string): FileCollaborationMetadata | undefined;
  listPrincipals(): Promise<readonly FileCollaborationPrincipal[]>;
  setShare(
    itemId: string,
    principalId: string,
    permissions: FileCollaborationPermissions | null,
  ): Promise<void>;
  listSharedRoots(): Promise<readonly FileItem[]>;
}
