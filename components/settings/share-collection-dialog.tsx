"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserPlus, Trash2, Users } from "lucide-react";
import type { IJMAPClient } from "@/lib/jmap/client-interface";
import type { CalendarRights, AddressBookRights } from "@/lib/jmap/types";
import type {
  FileCollaborationPermissions,
  FileCollaborationPrincipal,
} from "@/lib/files/collaboration";
import { toast } from "@/stores/toast-store";

type ShareKind = "calendar" | "addressBook" | "file";
type AnyRights =
  | CalendarRights
  | AddressBookRights
  | FileCollaborationPermissions;
type SharePrincipal = FileCollaborationPrincipal;

type RolePreset = "freeBusy" | "read" | "readWrite" | "manager" | "custom";

const CALENDAR_PRESETS: Record<Exclude<RolePreset, "custom">, CalendarRights> = {
  freeBusy: {
    mayReadFreeBusy: true, mayReadItems: false, mayWriteAll: false, mayWriteOwn: false,
    mayUpdatePrivate: false, mayRSVP: false, mayShare: false, mayDelete: false,
  },
  read: {
    mayReadFreeBusy: true, mayReadItems: true, mayWriteAll: false, mayWriteOwn: false,
    mayUpdatePrivate: false, mayRSVP: false, mayShare: false, mayDelete: false,
  },
  readWrite: {
    mayReadFreeBusy: true, mayReadItems: true, mayWriteAll: true, mayWriteOwn: true,
    mayUpdatePrivate: true, mayRSVP: true, mayShare: false, mayDelete: false,
  },
  manager: {
    mayReadFreeBusy: true, mayReadItems: true, mayWriteAll: true, mayWriteOwn: true,
    mayUpdatePrivate: true, mayRSVP: true, mayShare: true, mayDelete: true,
  },
};

const ADDRESS_BOOK_PRESETS: Record<Exclude<RolePreset, "custom" | "freeBusy">, AddressBookRights> = {
  read: { mayRead: true, mayWrite: false, mayShare: false, mayDelete: false },
  readWrite: { mayRead: true, mayWrite: true, mayShare: false, mayDelete: false },
  manager: { mayRead: true, mayWrite: true, mayShare: true, mayDelete: true },
};

const FILE_PRESETS: Record<
  Exclude<RolePreset, "custom" | "freeBusy">,
  FileCollaborationPermissions
> = {
  read: {
    read: true, addChildren: false, rename: false,
    delete: false, modifyContent: false, manageSharing: false,
  },
  readWrite: {
    read: true, addChildren: true, rename: true,
    delete: true, modifyContent: true, manageSharing: false,
  },
  manager: {
    read: true, addChildren: true, rename: true,
    delete: true, modifyContent: true, manageSharing: true,
  },
};

function detectCalendarPreset(r: CalendarRights): RolePreset {
  for (const [name, preset] of Object.entries(CALENDAR_PRESETS) as [Exclude<RolePreset, "custom">, CalendarRights][]) {
    if ((Object.keys(preset) as (keyof CalendarRights)[]).every((k) => preset[k] === r[k])) {
      return name;
    }
  }
  return "custom";
}

function detectAddressBookPreset(r: AddressBookRights): RolePreset {
  for (const [name, preset] of Object.entries(ADDRESS_BOOK_PRESETS) as [Exclude<RolePreset, "custom" | "freeBusy">, AddressBookRights][]) {
    const keys = Object.keys(preset) as (keyof AddressBookRights)[];
    if (keys.every((k) => preset[k] === (r[k] ?? false))) {
      return name;
    }
  }
  return "custom";
}

function detectFilePreset(r: FileCollaborationPermissions): RolePreset {
  for (const [name, preset] of Object.entries(FILE_PRESETS) as [
    Exclude<RolePreset, "custom" | "freeBusy">,
    FileCollaborationPermissions,
  ][]) {
    const keys = Object.keys(preset) as (keyof FileCollaborationPermissions)[];
    if (keys.every((k) => preset[k] === (r[k] ?? false))) {
      return name;
    }
  }
  return "custom";
}

function presetRights(kind: ShareKind, preset: RolePreset): AnyRights | undefined {
  if (preset === "custom") return undefined;
  if (kind === "calendar") return CALENDAR_PRESETS[preset as keyof typeof CALENDAR_PRESETS];
  if (kind === "file") return FILE_PRESETS[preset as keyof typeof FILE_PRESETS];
  return ADDRESS_BOOK_PRESETS[preset as keyof typeof ADDRESS_BOOK_PRESETS];
}

function detectPreset(kind: ShareKind, rights: AnyRights): RolePreset {
  if (kind === "calendar") return detectCalendarPreset(rights as CalendarRights);
  if (kind === "file") return detectFilePreset(rights as FileCollaborationPermissions);
  return detectAddressBookPreset(rights as AddressBookRights);
}

interface ShareCollectionDialogProps {
  client?: IJMAPClient;
  principalSource?: {
    listPrincipals(): Promise<readonly SharePrincipal[]>;
  };
  kind: ShareKind;
  collectionName: string;
  shareWith: Record<string, AnyRights> | null | undefined;
  ownAccountId: string;
  onShare: (principalId: string, rights: AnyRights | null) => Promise<void>;
  onClose: () => void;
}

export function ShareCollectionDialog({
  client,
  principalSource,
  kind,
  collectionName,
  shareWith,
  ownAccountId,
  onShare,
  onClose,
}: ShareCollectionDialogProps) {
  const t = useTranslations();
  const tCommon = useTranslations();
  const [allPrincipals, setAllPrincipals] = useState<SharePrincipal[]>([]);
  const [loadingPrincipals, setLoadingPrincipals] = useState(true);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Load principals on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingPrincipals(true);
    const load = principalSource
      ? principalSource.listPrincipals()
      : client?.getPrincipals() ?? Promise.resolve([]);
    load.then((list) => {
      if (cancelled) return;
      setAllPrincipals([...list]);
      setLoadingPrincipals(false);
    }).catch(() => {
      if (!cancelled) setLoadingPrincipals(false);
    });
    return () => { cancelled = true; };
  }, [client, principalSource]);

  // Map of every fetched principal by id, used for name/description lookups in
  // the shared list. Must include principals that already have a share so the
  // list shows their name rather than the raw id.
  const allPrincipalsById = useMemo(() => {
    const map = new Map<string, SharePrincipal>();
    for (const p of allPrincipals) map.set(p.id, p);
    return map;
  }, [allPrincipals]);

  // Principals available to add: exclude self and anyone already shared with.
  const principals = useMemo(() => {
    const existing = new Set(Object.keys(shareWith || {}));
    return allPrincipals.filter((p) => p.id !== ownAccountId && !existing.has(p.id));
  }, [allPrincipals, ownAccountId, shareWith]);

  const handleSetRights = async (principalId: string, preset: RolePreset) => {
    if (preset === "custom") return; // custom is read-only here
    const rights = presetRights(kind, preset);
    if (!rights) return;
    setSavingId(principalId);
    try {
      await onShare(principalId, rights);
      toast.success(t("Access updated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to update sharing"));
    } finally {
      setSavingId(null);
    }
  };

  const handleRemove = async (principalId: string) => {
    setSavingId(principalId);
    try {
      await onShare(principalId, null);
      toast.success(t("Access removed"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to update sharing"));
    } finally {
      setSavingId(null);
    }
  };

  const handleAdd = async (principal: SharePrincipal) => {
    const rights = presetRights(kind, "read");
    if (!rights) return;
    setSavingId(principal.id);
    try {
      await onShare(principal.id, rights);
      setShowAdd(false);
      setSearch("");
      toast.success(t("Access granted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to update sharing"));
    } finally {
      setSavingId(null);
    }
  };

  const filteredPrincipals = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return principals;
    return principals.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  }, [principals, search]);

  const sharedEntries = useMemo(() => {
    return Object.entries(shareWith || {}) as [string, AnyRights][];
  }, [shareWith]);

  const presetOptions = kind === "calendar"
    ? ["freeBusy", "read", "readWrite", "manager"] as const
    : ["read", "readWrite", "manager"] as const;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4 text-start">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <DialogTitle className="text-lg font-semibold">
              {t("Share \"{name}\"", { name: collectionName })}
            </DialogTitle>
          </div>
          <DialogDescription>{t("Grant access to other users or groups on this server. Changes take effect immediately.")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-4">
          {sharedEntries.length === 0 && !showAdd && (
            <div className="text-sm text-muted-foreground italic py-4 text-center">
              {t("Not shared with anyone yet.")}
            </div>
          )}

          {sharedEntries.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border overflow-hidden">
              {sharedEntries.map(([principalId, rights]) => {
                const principal = allPrincipalsById.get(principalId);
                const preset = detectPreset(kind, rights);
                return (
                  <li key={principalId} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar
                      name={principal?.name}
                      email={principal?.email ?? undefined}
                      size="sm"
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {principal?.name || principal?.email || principalId}
                      </div>
                      {principal?.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {principal.description}
                        </div>
                      )}
                    </div>
                    <Select
                      value={preset}
                      onValueChange={(value) => handleSetRights(principalId, value as RolePreset)}
                      disabled={savingId === principalId}
                    >
                      <SelectTrigger size="sm" className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {presetOptions.map((p) => (
                          <SelectItem key={p} value={p}>{t(`preset.${p}`)}</SelectItem>
                        ))}
                        {preset === "custom" && (
                          <SelectItem value="custom">{t("Custom")}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => handleRemove(principalId)}
                      disabled={savingId === principalId}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      aria-label={t("Remove access")}
                      title={t("Remove access")}
                    >
                      {savingId === principalId
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!showAdd && (
            <Button
              variant="outline"
              onClick={() => setShowAdd(true)}
              className="w-full"
            >
              <UserPlus className="w-4 h-4 me-2" />
              {t("Add person or group")}
            </Button>
          )}

          {showAdd && (
            <div className="flex flex-col gap-2 border border-border rounded-md p-3">
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search by name or email…")}
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto -mx-1">
                {loadingPrincipals && (
                  <div className="flex items-center justify-center py-4 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin me-2" />
                    {t("Loading users…")}
                  </div>
                )}
                {!loadingPrincipals && filteredPrincipals.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-3">
                    {search.trim() ? t("No matches.") : t("No other users or groups found.")}
                  </div>
                )}
                {!loadingPrincipals && filteredPrincipals.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAdd(p)}
                    disabled={savingId === p.id}
                    className="w-full text-start px-3 py-2 rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar
                        name={p.name}
                        email={p.email ?? undefined}
                        size="sm"
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-2">
                          {p.name}
                          {p.type === "group" && (
                            <span className="text-[10px] uppercase font-normal text-muted-foreground bg-muted rounded px-1 py-0.5">
                              {t("Group")}
                            </span>
                          )}
                        </div>
                        {p.email && p.email !== p.name && (
                          <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                        )}
                      </div>
                      {savingId === p.id && <Loader2 className="w-4 h-4 animate-spin" />}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setSearch(""); }}>
                  {tCommon("Cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4 sm:justify-end">
          <Button onClick={onClose}>{tCommon("Close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
