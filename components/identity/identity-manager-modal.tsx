'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from '@/i18n/client';
import { X, Mail, Pencil, Trash2, Plus, AlertTriangle, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IdentityForm } from './identity-form';
import { useIdentityStore } from '@/stores/identity-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';

function useSyncIdentities() {
  const syncIdentities = useAuthStore((state) => state.syncIdentities);
  return syncIdentities;
}

function useRefreshIdentities() {
  return useAuthStore((state) => state.refreshIdentities);
}
import type { Identity, EmailAddress } from '@/lib/jmap/types';
import { toast } from '@/stores/toast-store';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { useConfirmDialog } from '@/hooks/use-confirm-dialog';

function emailMatchesUsername(email: string, username: string): boolean {
  if (email === username) return true;
  if (!username.includes('@') && email.split('@')[0] === username) return true;
  return false;
}

interface IdentityFormData {
  name: string;
  email: string;
  replyTo?: EmailAddress[] | null;
  bcc?: EmailAddress[] | null;
  textSignature?: string | null;
  htmlSignature?: string | null;
}

interface IdentityManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IdentityManagerModal({ isOpen, onClose }: IdentityManagerModalProps) {
  const t = useTranslations();
  const tNotif = useTranslations();

  const client = useAuthStore((state) => state.client);
  const identities = useIdentityStore((state) => state.identities);
  const _preferredPrimaryId = useIdentityStore((state) => state.preferredPrimaryId);
  const setPreferredPrimary = useIdentityStore((state) => state.setPreferredPrimary);
  const syncIdentities = useSyncIdentities();

  const refreshIdentitiesFromServer = useRefreshIdentities();

  // Refresh identities from server whenever the modal is opened
  useEffect(() => {
    if (isOpen) {
      refreshIdentitiesFromServer();
    }
  }, [isOpen, refreshIdentitiesFromServer]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { dialogProps: confirmDialogProps, confirm: confirmDialog } = useConfirmDialog();

  // Re-fetch all identities from server and update stores
  const refreshIdentities = useCallback(async () => {
    if (!client) return;
    try {
      const serverIdentities = await client.getIdentities();
      const username = useAuthStore.getState().username;
      const preferredPrimaryId = useIdentityStore.getState().preferredPrimaryId;
      const sorted = [...serverIdentities].sort((a, b) => {
        const aMatch = emailMatchesUsername(a.email, username || '');
        const bMatch = emailMatchesUsername(b.email, username || '');
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        if (aMatch && bMatch) {
          if (!a.mayDelete && b.mayDelete) return -1;
          if (a.mayDelete && !b.mayDelete) return 1;
        }
        return 0;
      });
      // Move preferred primary to front if set
      if (preferredPrimaryId) {
        const idx = sorted.findIndex((id) => id.id === preferredPrimaryId);
        if (idx > 0) {
          const [preferred] = sorted.splice(idx, 1);
          sorted.unshift(preferred);
        }
      }
      useIdentityStore.getState().setIdentities(sorted);
      syncIdentities();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh identities';
      toast.error(message);
    }
  }, [client, syncIdentities]);

  // Focus trap with Escape handling
  const modalRef = useFocusTrap({
    isActive: isOpen,
    onEscape: () => {
      if (isCreating || editingId) {
        setIsCreating(false);
        setEditingId(null);
      } else {
        onClose();
      }
    },
    restoreFocus: true,
  });

  // Close on click outside (but not when ConfirmDialog is open)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (confirmDialogProps.isOpen) return;
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose, modalRef, confirmDialogProps.isOpen]);

  const handleCreate = useCallback(async (data: IdentityFormData) => {
    if (!client) return;

    try {
      await client.createIdentity(
        data.name,
        data.email,
        data.replyTo,
        data.bcc,
        data.textSignature,
        data.htmlSignature
      );

      await refreshIdentities();
      setIsCreating(false);
      toast.success(tNotif("Identity created successfully"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("Unknown error");
      toast.error(tNotif("Failed to create identity: {error}", { error: message }));
      throw error;
    }
  }, [client, refreshIdentities, t, tNotif]);

  const handleUpdate = useCallback(async (identity: Identity, data: IdentityFormData) => {
    if (!client) return;

    try {
      await client.updateIdentity(identity.id, {
        name: data.name,
        replyTo: data.replyTo,
        bcc: data.bcc,
        textSignature: data.textSignature,
        htmlSignature: data.htmlSignature,
      });

      await refreshIdentities();
      setEditingId(null);
      toast.success(tNotif("Identity updated successfully"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("Unknown error");
      toast.error(tNotif("Failed to update identity: {error}", { error: message }));
      throw error;
    }
  }, [client, refreshIdentities, t, tNotif]);

  const handleDelete = useCallback(async (identity: Identity) => {
    if (!client) return;
    if (!identity.mayDelete) {
      toast.error(t("This identity cannot be deleted"));
      return;
    }

    const confirmed = await confirmDialog({
      title: t("Delete Identity"),
      message: t("Delete this identity? This cannot be undone."),
      confirmText: t("Delete"),
      variant: "destructive",
    });
    if (!confirmed) return;

    setDeletingId(identity.id);

    try {
      await client.deleteIdentity(identity.id);
      await refreshIdentities();
      toast.success(tNotif("Identity deleted"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("Unknown error");
      toast.error(tNotif("Failed to delete identity: {error}", { error: message }));
    } finally {
      setDeletingId(null);
    }
  }, [client, refreshIdentities, t, tNotif, confirmDialog]);

  const handleSetPrimary = useCallback((identity: Identity) => {
    setPreferredPrimary(identity.id);
    // Persist to the synced settings (keyed by username, matching how
    // loadIdentities reads it back) so the choice survives a new browser /
    // cleared site data and reaches other devices (#507).
    const username = useAuthStore.getState().username || '';
    if (username) {
      const current = useSettingsStore.getState().preferredIdentityIds;
      useSettingsStore.getState().updateSetting('preferredIdentityIds', {
        ...current,
        [username]: identity.id,
      });
    }
    // Re-sort: move the preferred identity to the front
    const reordered = [identity, ...identities.filter((id) => id.id !== identity.id)];
    useIdentityStore.getState().setIdentities(reordered);
    syncIdentities();
    toast.success(tNotif("Primary identity updated"));
  }, [identities, setPreferredPrimary, syncIdentities, tNotif]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="identity-modal-title"
        className={cn(
          'bg-background border border-border rounded-lg shadow-xl',
          'w-full max-w-3xl max-h-[90vh] overflow-hidden',
          'animate-in zoom-in-95 duration-200'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-muted-foreground" />
            <h2 id="identity-modal-title" className="text-lg font-semibold text-foreground">
              {t("Manage Sending Identities")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted transition-colors duration-150 text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Create New Form */}
          {isCreating && (
            <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30">
              <h3 className="text-sm font-semibold mb-4">{t("Create New Identity")}</h3>
              <IdentityForm
                onSave={handleCreate}
                onCancel={() => setIsCreating(false)}
              />
            </div>
          )}

          {/* Create Button */}
          {!isCreating && !editingId && (
            <Button
              onClick={() => setIsCreating(true)}
              className="mb-6 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 me-2" />
              {t("Create New Identity")}
            </Button>
          )}

          {/* Identities List */}
          <div className="flex flex-col gap-4">
            {identities.map((identity) => (
              <div
                key={identity.id}
                className="border border-border rounded-lg overflow-hidden"
              >
                {editingId === identity.id ? (
                  <div className="p-4 bg-muted/30">
                    <h3 className="text-sm font-semibold mb-4">
                      {t("Edit Identity")}
                    </h3>
                    <IdentityForm
                      identity={identity}
                      onSave={(data) => handleUpdate(identity, data)}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground truncate">
                            {identity.name}
                          </h3>
                          {identities[0]?.id === identity.id && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                              {t("Primary")}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {identity.email}
                        </p>

                        {/* Additional Info */}
                        <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                          {identity.replyTo && identity.replyTo.length > 0 && (
                            <p>
                              {t("Reply-To:")} {identity.replyTo.map((a) => a.email).join(', ')}
                            </p>
                          )}
                          {identity.bcc && identity.bcc.length > 0 && (
                            <p>
                              {t("BCC:")} {identity.bcc.map((a) => a.email).join(', ')}
                            </p>
                          )}
                          {identity.textSignature && (
                            <p className="line-clamp-2">
                              {t("Signature:")} {identity.textSignature}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {identities[0]?.id !== identity.id && identities.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetPrimary(identity)}
                            disabled={!!editingId || isCreating}
                            title={t("Set as primary")}
                          >
                            <Star className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingId(identity.id)}
                          disabled={!!editingId || isCreating}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(identity)}
                          disabled={
                            !identity.mayDelete ||
                            !!editingId ||
                            isCreating ||
                            deletingId === identity.id
                          }
                          className={!identity.mayDelete ? 'opacity-30' : ''}
                        >
                          {!identity.mayDelete ? (
                            <AlertTriangle className="w-4 h-4 text-warning" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {!identity.mayDelete && (
                      <p className="text-xs text-warning mt-2 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {t("This identity cannot be deleted")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}

            {identities.length === 0 && !isCreating && (
              <div className="text-center py-12 text-muted-foreground">
                <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">{t("No identities found")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog {...confirmDialogProps} />
    </div>
  );
}
