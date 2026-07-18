"use client";

import { useTranslations } from "@/i18n/client";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Plus, CalendarDays, CheckSquare, Clock } from "lucide-react";

interface Position {
  x: number;
  y: number;
}

interface EmptySpaceContextMenuProps {
  position: Position;
  isOpen: boolean;
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onNewEvent: () => void;
  onNewAllDayEvent: () => void;
  onNewTask?: () => void;
  onGoToToday: () => void;
  showAllDayOption?: boolean;
}

export function EmptySpaceContextMenu({
  position,
  isOpen,
  onClose,
  menuRef,
  onNewEvent,
  onNewAllDayEvent,
  onNewTask,
  onGoToToday,
  showAllDayOption = true,
}: EmptySpaceContextMenuProps) {
  const t = useTranslations();

  const handle = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <ContextMenu ref={menuRef} isOpen={isOpen} position={position} onClose={onClose}>
      <ContextMenuItem icon={Plus} label={t("New event")} onClick={handle(onNewEvent)} />
      {showAllDayOption && (
        <ContextMenuItem
          icon={CalendarDays}
          label={t("New all-day event")}
          onClick={handle(onNewAllDayEvent)}
        />
      )}
      {onNewTask && (
        <ContextMenuItem
          icon={CheckSquare}
          label={t("New task")}
          onClick={handle(onNewTask)}
        />
      )}
      <ContextMenuSeparator />
      <ContextMenuItem icon={Clock} label={t("Go to today")} onClick={handle(onGoToToday)} />
    </ContextMenu>
  );
}
