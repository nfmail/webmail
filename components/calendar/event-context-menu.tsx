"use client";

import { useTranslations } from "@/i18n/client";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Pencil,
  Copy,
  Download,
  ClipboardCopy,
  Link as LinkIcon,
  Trash2,
} from "lucide-react";
import type { CalendarEvent } from "@/lib/jmap/types";

interface Position {
  x: number;
  y: number;
}

interface EventContextMenuProps {
  event: CalendarEvent;
  position: Position;
  isOpen: boolean;
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onEdit: () => void;
  onDuplicate: () => void;
  onExportICS: () => void;
  onCopyTitle: () => void;
  onCopyMeetingLink?: () => void;
  onDelete: () => void;
}

export function EventContextMenu({
  event,
  position,
  isOpen,
  onClose,
  menuRef,
  onEdit,
  onDuplicate,
  onExportICS,
  onCopyTitle,
  onCopyMeetingLink,
  onDelete,
}: EventContextMenuProps) {
  const t = useTranslations();

  const handle = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const hasMeetingLink = !!(
    event.virtualLocations && Object.values(event.virtualLocations).some((v) => v.uri)
  );

  return (
    <ContextMenu ref={menuRef} isOpen={isOpen} position={position} onClose={onClose}>
      <ContextMenuItem icon={Pencil} label={t("Edit event")} onClick={handle(onEdit)} />
      <ContextMenuItem icon={Copy} label={t("Duplicate")} onClick={handle(onDuplicate)} />
      <ContextMenuSeparator />
      <ContextMenuItem
        icon={Download}
        label={t("Export as .ics")}
        onClick={handle(onExportICS)}
      />
      <ContextMenuItem
        icon={ClipboardCopy}
        label={t("Copy title")}
        onClick={handle(onCopyTitle)}
      />
      {hasMeetingLink && onCopyMeetingLink && (
        <ContextMenuItem
          icon={LinkIcon}
          label={t("Copy meeting link")}
          onClick={handle(onCopyMeetingLink)}
        />
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        icon={Trash2}
        label={t("Delete event")}
        onClick={handle(onDelete)}
        destructive
      />
    </ContextMenu>
  );
}
