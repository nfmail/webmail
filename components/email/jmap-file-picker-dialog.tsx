"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/i18n/client";
import {
  ChevronLeft,
  File,
  Folder,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/utils";
import type {
  EmailAttachmentSource,
  StoredEmailAttachment,
} from "@/lib/files/email-attachment-source";
import type { FileItem } from "@/lib/files/provider";

interface JmapFilePickerDialogProps {
  isOpen: boolean;
  source: EmailAttachmentSource | null;
  onClose: () => void;
  onAttach: (attachments: readonly StoredEmailAttachment[]) => void;
}

interface PathEntry {
  id: string | null;
  name: string;
}

async function listAllItems(
  source: EmailAttachmentSource,
  parentId: string | null,
  signal: AbortSignal,
): Promise<readonly FileItem[]> {
  const items: FileItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await source.list({
      parentId,
      cursor,
      limit: 200,
      signal,
    });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

export function JmapFilePickerDialog({
  isOpen,
  source,
  onClose,
  onAttach,
}: JmapFilePickerDialogProps) {
  const t = useTranslations("email_composer.jmap_files");
  const tCommon = useTranslations("common");
  const [path, setPath] = useState<PathEntry[]>([
    { id: null, name: "JMAP Files" },
  ]);
  const [items, setItems] = useState<readonly FileItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentParentId = path[path.length - 1]?.id ?? null;
  const loadErrorMessage = t("load_error");

  useEffect(() => {
    if (!isOpen) return;
    setPath([{ id: null, name: "JMAP Files" }]);
    setSelectedIds(new Set());
    setError(null);
    setIsAttaching(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !source) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    listAllItems(source, currentParentId, controller.signal)
      .then((nextItems) => {
        setItems(nextItems);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setItems([]);
        setError(loadError instanceof Error ? loadError.message : loadErrorMessage);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [currentParentId, isOpen, loadErrorMessage, source]);

  const sortedItems = useMemo(
    () => [...items].sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name);
    }),
    [items],
  );

  const toggleFile = (itemId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const attachSelected = async () => {
    if (!source || selectedIds.size === 0 || isAttaching) return;
    setIsAttaching(true);
    setError(null);
    try {
      const attachments = await source.resolve([...selectedIds]);
      onAttach(attachments);
      onClose();
    } catch (attachError) {
      setError(
        attachError instanceof Error ? attachError.message : t("attach_error"),
      );
    } finally {
      setIsAttaching(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border p-5 text-start">
          <DialogTitle className="text-lg">{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={path.length === 1 || isLoading}
            onClick={() => setPath((current) => current.slice(0, -1))}
          >
            <ChevronLeft className="me-2 size-4" />
            {t("back")}
          </Button>
          <span className="truncate text-sm text-muted-foreground">
            {path.map((entry) => entry.name).join(" / ")}
          </span>
        </div>

        <div className="min-h-64 flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex min-h-56 items-center justify-center" role="status">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <span className="sr-only">{tCommon("loading")}</span>
            </div>
          ) : error ? (
            <div className="flex min-h-56 items-center justify-center px-6 text-center">
              <p role="alert" className="text-sm text-destructive">{error}</p>
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="flex min-h-56 items-center justify-center px-6 text-center">
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {sortedItems.map((item) => (
                <li key={item.id}>
                  {item.kind === "directory" ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-start hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        setPath((current) => [
                          ...current,
                          { id: item.id, name: item.name },
                        ]);
                      }}
                    >
                      <Folder className="size-5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {item.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("open_folder")}
                      </span>
                    </button>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 hover:bg-accent hover:text-accent-foreground">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleFile(item.id)}
                        className="size-4 rounded border-input accent-primary"
                      />
                      <File className="size-5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {item.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatFileSize(item.size ?? 0)}
                      </span>
                    </label>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-4 border-t border-border px-5 py-4 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {t("selected", { count: selectedIds.size })}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              disabled={selectedIds.size === 0 || isAttaching}
              onClick={attachSelected}
            >
              {isAttaching && <Loader2 className="me-2 size-4 animate-spin" />}
              {t("attach", { count: selectedIds.size })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
