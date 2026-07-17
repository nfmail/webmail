import { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import {
  ToggleGroup as UiToggleGroup,
  ToggleGroupItem as UiToggleGroupItem,
} from '@/components/ui/toggle-group';
import {
  Select as UiSelect,
  SelectContent as UiSelectContent,
  SelectItem as UiSelectItem,
  SelectTrigger as UiSelectTrigger,
  SelectValue as UiSelectValue,
} from '@/components/ui/select';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <div data-search-label={title} className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-medium text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

interface SettingItemProps {
  label: string;
  description?: string;
  children: ReactNode;
  locked?: boolean;
  /**
   * When set, associates the item's visible label with the control that renders
   * this `id`, giving the control a programmatic label. Match it to the `id`
   * (or `SelectTrigger id`) of the control passed as children.
   */
  htmlFor?: string;
}

export function SettingItem({ label, description, children, locked, htmlFor }: SettingItemProps) {
  return (
    <div
      data-search-label={label}
      className={cn("flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 py-3 border-b border-border last:border-0", locked && "opacity-60")}
    >
      <div className="flex-1 min-w-0 sm:pe-4">
        <div className="flex items-center gap-1.5">
          <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</label>
          {locked && <Lock className="w-3 h-3 text-muted-foreground" aria-label="Managed by administrator" />}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <div className={cn("flex-shrink-0", locked && "pointer-events-none")}>{children}</div>
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  id,
  'aria-label': ariaLabel,
}: ToggleSwitchProps) {
  return (
    <Switch
      id={id}
      aria-label={ariaLabel}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
    />
  );
}

interface RadioGroupProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  'aria-label'?: string;
}

export function RadioGroup({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
}: RadioGroupProps) {
  return (
    <UiToggleGroup
      type="single"
      variant="outline"
      value={value}
      aria-label={ariaLabel}
      // Radix emits '' when the active item is toggled off; a radio group is
      // single-select and cannot be empty, so ignore the deselect event.
      onValueChange={(next) => next && onChange(next)}
    >
      {options.map((option) => (
        <UiToggleGroupItem key={option.value} value={option.value} className="text-xs">
          {option.label}
        </UiToggleGroupItem>
      ))}
    </UiToggleGroup>
  );
}

// Radix Select reserves the empty string internally for the "no value" /
// placeholder state and throws if a <SelectItem> receives an empty-string
// value. Some callers legitimately use '' as an option (e.g. a "none" choice),
// so we map '' to a sentinel on the way into Radix and back out on change.
const EMPTY_VALUE_SENTINEL = '__nfw_select_empty__';

const toRadixValue = (value: string) =>
  value === '' ? EMPTY_VALUE_SENTINEL : value;
const fromRadixValue = (value: string) =>
  value === EMPTY_VALUE_SENTINEL ? '' : value;

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export function Select({
  value,
  onChange,
  options,
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
}: SelectProps) {
  return (
    <UiSelect
      value={toRadixValue(value)}
      onValueChange={(next) => onChange(fromRadixValue(next))}
      disabled={disabled}
    >
      <UiSelectTrigger
        id={id}
        aria-label={ariaLabel}
        dir="auto"
        className={cn('text-sm', className)}
      >
        <UiSelectValue />
      </UiSelectTrigger>
      <UiSelectContent>
        {options.map((option) => (
          <UiSelectItem
            key={option.value}
            value={toRadixValue(option.value)}
            dir="auto"
          >
            {option.label}
          </UiSelectItem>
        ))}
      </UiSelectContent>
    </UiSelect>
  );
}
