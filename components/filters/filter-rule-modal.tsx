"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/stores/toast-store";
import type {
  FilterRule,
  FilterCondition,
  FilterAction,
  FilterConditionField,
  FilterComparator,
  FilterActionType,
} from "@/lib/jmap/sieve-types";
import type { Mailbox } from "@/lib/jmap/types";
import { buildMailboxTree, flattenMailboxTree, type MailboxNode, generateUUID } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";

interface FilterRuleModalProps {
  rule?: FilterRule;
  mailboxes: Mailbox[];
  onSave: (rule: FilterRule) => void;
  onClose: () => void;
}

// Radix Select reserves the empty string for its internal "no value" state and
// throws if a <SelectItem> receives value="". The mailbox and label pickers use
// "" as a real "not chosen yet" option, so map it to a sentinel on the way into
// Radix and back out on change to preserve the stored value shape.
const EMPTY_VALUE_SENTINEL = "__nfw_select_empty__";
const toRadixValue = (value: string) => (value === "" ? EMPTY_VALUE_SENTINEL : value);
const fromRadixValue = (value: string) => (value === EMPTY_VALUE_SENTINEL ? "" : value);

const ALL_FIELDS: FilterConditionField[] = [
  "from", "to", "cc", "subject", "header", "size", "body", "attachment",
];

const TEXT_COMPARATORS: FilterComparator[] = [
  "contains", "not_contains", "is", "not_is", "starts_with", "ends_with", "matches",
];

const SIZE_COMPARATORS: FilterComparator[] = ["greater_than", "less_than"];

const ATTACHMENT_COMPARATORS: FilterComparator[] = ["has_any", "has_type"];

function comparatorsFor(field: FilterConditionField): FilterComparator[] {
  if (field === "size") return SIZE_COMPARATORS;
  if (field === "attachment") return ATTACHMENT_COMPARATORS;
  return TEXT_COMPARATORS;
}

const ALL_ACTION_TYPES: FilterActionType[] = [
  "move", "copy", "forward", "mark_read", "star", "add_label", "discard", "reject", "keep", "stop",
];

const ACTIONS_WITH_VALUE = new Set<FilterActionType>(["move", "copy", "forward", "reject", "add_label"]);
const ACTIONS_WITH_MAILBOX = new Set<FilterActionType>(["move", "copy"]);

function makeEmptyCondition(): FilterCondition {
  return { field: "from", comparator: "contains", value: "" };
}

// Multi-value handling: conditions are stored as string | string[]. The UI
// presents them as a single comma-separated text input — the user types
// "a, b, c" and the saved value becomes ["a","b","c"]. Single entries stay
// strings so existing single-value rules don't change shape.
function valueToInputString(v: string | string[]): string {
  if (Array.isArray(v)) return v.join(", ");
  return v;
}

function inputStringToValue(s: string): string | string[] {
  const parts = s.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts;
}

function isConditionValueEmpty(v: string | string[]): boolean {
  if (Array.isArray(v)) return v.length === 0 || v.every((x) => !x.trim());
  return !v.trim();
}

function makeEmptyAction(): FilterAction {
  return { type: "move", value: "" };
}

export function FilterRuleModal({
  rule,
  mailboxes,
  onSave,
  onClose,
}: FilterRuleModalProps) {
  const t = useTranslations("settings.filters");
  const isEdit = !!rule;
  const emailKeywords = useSettingsStore((state) => state.emailKeywords);

  const [name, setName] = useState(rule?.name || "");
  const [matchType, setMatchType] = useState<"all" | "any">(rule?.matchType || "all");
  const [conditions, setConditions] = useState<FilterCondition[]>(
    rule?.conditions.length ? [...rule.conditions] : [makeEmptyCondition()]
  );
  const [actions, setActions] = useState<FilterAction[]>(
    rule?.actions.length ? [...rule.actions] : [makeEmptyAction()]
  );
  const [stopProcessing, setStopProcessing] = useState(rule?.stopProcessing ?? false);

  const { hierarchicalMailboxes, mailboxPathMap } = useMemo(() => {
    const tree = buildMailboxTree(mailboxes.filter((mb) => !mb.isShared));
    const pathMap = new Map<string, string>();
    const buildPaths = (nodes: MailboxNode[], parentPath = "") => {
      for (const node of nodes) {
        // Sieve fileinto expects the IMAP-canonical "INBOX" for the inbox,
        // not the localized JMAP display name (e.g. "Entrada" in pt-BR).
        const segment = node.role === "inbox" ? "INBOX" : node.name;
        const fullPath = parentPath ? `${parentPath}/${segment}` : segment;
        pathMap.set(node.id, fullPath);
        if (node.children.length > 0) buildPaths(node.children, fullPath);
      }
    };
    buildPaths(tree);
    return { hierarchicalMailboxes: flattenMailboxTree(tree), mailboxPathMap: pathMap };
  }, [mailboxes]);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error(t("validation_empty_name"));
      return;
    }

    // While editing, condition.value is always the raw string typed into the
    // input (commas not yet split). Convert to array form here on save so a
    // user typing "a, b, c" actually persists as ["a","b","c"]. This is the
    // moment we know editing is finished - splitting earlier would eat any
    // comma the user just typed mid-edit.
    const validConditions = conditions
      .filter((c) => {
        if (c.field === "attachment" && c.comparator === "has_any") return true;
        return !isConditionValueEmpty(c.value);
      })
      .map((c) => {
        if (c.field === "attachment" && c.comparator === "has_any") return c;
        if (c.field === "size") return c; // numeric, single-value only
        if (typeof c.value !== "string") return c; // already structured
        const parsed = inputStringToValue(c.value);
        return { ...c, value: parsed };
      });
    if (validConditions.length === 0) {
      toast.error(t("validation_empty_conditions"));
      return;
    }

    const validActions = actions.filter(
      (a) => !ACTIONS_WITH_VALUE.has(a.type) || a.value?.trim()
    );
    if (validActions.length === 0) {
      toast.error(t("validation_empty_actions"));
      return;
    }

    onSave({
      id: rule?.id || generateUUID(),
      name: trimmedName,
      enabled: rule?.enabled ?? true,
      matchType,
      conditions: validConditions,
      actions: validActions,
      stopProcessing,
    });
  }, [name, matchType, conditions, actions, stopProcessing, rule, onSave, t]);

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    setConditions((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        const updated = { ...c, ...updates };
        // Reconcile the comparator when the field changes so we never end up
        // with e.g. (field=attachment, comparator=contains) — invalid for the
        // Sieve generator. Each field has its own valid comparator set.
        if (updates.field && updates.field !== c.field) {
          const allowed = comparatorsFor(updates.field);
          if (!allowed.includes(c.comparator)) {
            updated.comparator = allowed[0];
          }
        }
        if (updates.field && updates.field !== "header") {
          delete updated.headerName;
        }
        // has_any takes no value; clear it so we don't leak old text into
        // the generated Sieve.
        if (updated.field === "attachment" && updated.comparator === "has_any") {
          updated.value = "";
        }
        // Size is numeric, single value only - collapse any list to scalar.
        if (updated.field === "size" && Array.isArray(updated.value)) {
          updated.value = updated.value[0] ?? "";
        }
        return updated;
      })
    );
  };

  const removeCondition = (index: number) => {
    if (conditions.length <= 1) return;
    setConditions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, updates: Partial<FilterAction>) => {
    setActions((prev) =>
      prev.map((a, i) => {
        if (i !== index) return a;
        const updated = { ...a, ...updates };
        if (updates.type && !ACTIONS_WITH_VALUE.has(updates.type)) {
          delete updated.value;
        }
        if (updates.type && ACTIONS_WITH_MAILBOX.has(updates.type) && !updated.value) {
          const firstMb = hierarchicalMailboxes[0];
          updated.value = firstMb ? (mailboxPathMap.get(firstMb.id) || firstMb.name) : "";
        }
        return updated;
      })
    );
  };

  const removeAction = (index: number) => {
    if (actions.length <= 1) return;
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("edit_rule") : t("new_rule")}</DialogTitle>
        </DialogHeader>

        <FieldGroup>
          {/* Rule name */}
          <Field>
            <FieldLabel htmlFor="filter-rule-name">{t("rule_name")}</FieldLabel>
            <Input
              id="filter-rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("rule_name_placeholder")}
              maxLength={200}
              autoFocus
            />
          </Field>

          {/* Match type */}
          <Field>
            <FieldLabel>{t("match_type")}</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={matchType}
              aria-label={t("match_type")}
              // A match type is single-select and cannot be empty; ignore the
              // deselect event Radix emits when the active item is toggled off.
              onValueChange={(next) => next && setMatchType(next as "all" | "any")}
            >
              <ToggleGroupItem value="all" className="text-xs">
                {t("match_all")}
              </ToggleGroupItem>
              <ToggleGroupItem value="any" className="text-xs">
                {t("match_any")}
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>

          {/* Conditions */}
          <Field>
            <FieldLabel>{t("conditions")}</FieldLabel>
            <div className="flex flex-col gap-2">
              {conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2 flex-wrap">
                  <Select
                    value={condition.field}
                    onValueChange={(v) =>
                      updateCondition(index, { field: v as FilterConditionField })
                    }
                  >
                    <SelectTrigger size="sm" className="w-auto" aria-label={t("conditions")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_FIELDS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {t(`condition_fields.${f}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {condition.field === "header" && (
                    <Input
                      value={condition.headerName || ""}
                      onChange={(e) =>
                        updateCondition(index, { headerName: e.target.value })
                      }
                      placeholder={t("header_name")}
                      className="w-28"
                    />
                  )}

                  <Select
                    value={condition.comparator}
                    onValueChange={(v) =>
                      updateCondition(index, { comparator: v as FilterComparator })
                    }
                  >
                    <SelectTrigger size="sm" className="w-auto" aria-label={t("comparators.contains")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {comparatorsFor(condition.field).map((c) => (
                        <SelectItem key={c} value={c}>
                          {t(`comparators.${c}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* has_any takes no value; render a stub so the row layout
                      stays consistent but no input is editable. */}
                  {condition.field === "attachment" && condition.comparator === "has_any" ? (
                    <div className="flex-1 min-w-[120px]" />
                  ) : (
                    <Input
                      value={valueToInputString(condition.value)}
                      onChange={(e) =>
                        // Store the raw input string while typing. Splitting
                        // commas into an array on every keystroke would eat
                        // the comma the moment it's typed.
                        updateCondition(index, { value: e.target.value })
                      }
                      onBlur={(e) => {
                        // On blur: normalise comma-separated input into an
                        // array (or single string when only one item). Size
                        // stays numeric/single-value; attachment-has_any has
                        // no value at all.
                        if (condition.field === "size") return;
                        if (
                          condition.field === "attachment" &&
                          condition.comparator === "has_any"
                        )
                          return;
                        const parsed = inputStringToValue(e.target.value);
                        // Only update if the normalised shape actually
                        // differs - avoids triggering a no-op re-render and
                        // resetting the user's cursor on every blur.
                        if (
                          JSON.stringify(parsed) !== JSON.stringify(condition.value)
                        ) {
                          updateCondition(index, { value: parsed });
                        }
                      }}
                      placeholder={
                        condition.field === "size"
                          ? t("size_placeholder")
                          : condition.field === "attachment"
                            ? t("attachment_type_placeholder")
                            : t("value_placeholder_multi")
                      }
                      className="flex-1 min-w-[120px]"
                      type={condition.field === "size" ? "number" : "text"}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => removeCondition(index)}
                    disabled={conditions.length <= 1}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    aria-label={t("delete_rule")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setConditions((prev) => [...prev, makeEmptyCondition()])}
                className="flex items-center gap-1 self-start text-sm text-primary hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("add_condition")}
              </button>
            </div>
          </Field>

          {/* Actions */}
          <Field>
            <FieldLabel>{t("actions")}</FieldLabel>
            <div className="flex flex-col gap-2">
              {actions.map((action, index) => (
                <div key={index} className="flex items-center gap-2 flex-wrap">
                  <Select
                    value={action.type}
                    onValueChange={(v) =>
                      updateAction(index, { type: v as FilterActionType })
                    }
                  >
                    <SelectTrigger size="sm" className="w-auto" aria-label={t("actions")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_ACTION_TYPES.map((a) => (
                        <SelectItem key={a} value={a}>
                          {t(`action_types.${a}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {ACTIONS_WITH_MAILBOX.has(action.type) && (
                    <Select
                      value={toRadixValue(action.value || "")}
                      onValueChange={(v) => updateAction(index, { value: fromRadixValue(v) })}
                    >
                      <SelectTrigger
                        size="sm"
                        className="flex-1 min-w-[140px]"
                        aria-label={t("move_to_folder")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_VALUE_SENTINEL}>{t("move_to_folder")}</SelectItem>
                        {hierarchicalMailboxes.map((mb) => (
                          <SelectItem key={mb.id} value={mailboxPathMap.get(mb.id) || mb.name}>
                            {" ".repeat(mb.depth * 3)}{mb.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {action.type === "forward" && (
                    <Input
                      value={action.value || ""}
                      onChange={(e) => updateAction(index, { value: e.target.value })}
                      placeholder={t("forward_placeholder")}
                      type="email"
                      className="flex-1 min-w-[180px]"
                    />
                  )}

                  {action.type === "reject" && (
                    <Input
                      value={action.value || ""}
                      onChange={(e) => updateAction(index, { value: e.target.value })}
                      placeholder={t("reject_placeholder")}
                      className="flex-1 min-w-[180px]"
                    />
                  )}

                  {action.type === "add_label" && (
                    <Select
                      value={toRadixValue(action.value || "")}
                      onValueChange={(v) => updateAction(index, { value: fromRadixValue(v) })}
                    >
                      <SelectTrigger
                        size="sm"
                        className="flex-1 min-w-[140px]"
                        aria-label={t("label_placeholder")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_VALUE_SENTINEL}>{t("label_placeholder")}</SelectItem>
                        {emailKeywords.map((kw) => (
                          <SelectItem key={kw.id} value={kw.id}>{kw.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <button
                    type="button"
                    onClick={() => removeAction(index)}
                    disabled={actions.length <= 1}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    aria-label={t("delete_rule")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setActions((prev) => [...prev, makeEmptyAction()])}
                className="flex items-center gap-1 self-start text-sm text-primary hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("add_action")}
              </button>
            </div>
          </Field>

          {/* Stop processing */}
          <Field orientation="horizontal">
            <Checkbox
              id="stopProcessing"
              checked={stopProcessing}
              onCheckedChange={(checked) => setStopProcessing(checked === true)}
            />
            <FieldLabel htmlFor="stopProcessing" className="font-normal">
              {t("stop_processing")}
            </FieldLabel>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
