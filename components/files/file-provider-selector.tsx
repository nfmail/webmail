"use client";

import { Cloud, Database } from "lucide-react";

export type FileProviderKind = "jmap" | "webdav";

interface FileProviderSelectorProps {
  value: FileProviderKind;
  onChange: (value: FileProviderKind) => void;
  label: string;
  disabled?: boolean;
}

const PROVIDERS: ReadonlyArray<{
  value: FileProviderKind;
  label: string;
}> = [
  { value: "jmap", label: "JMAP" },
  { value: "webdav", label: "WebDAV" },
];

export function FileProviderSelector({
  value,
  onChange,
  label,
  disabled = false,
}: FileProviderSelectorProps) {
  const Icon = value === "jmap" ? Database : Cloud;

  return (
    <label className="flex min-w-0 items-center gap-2 text-sm">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as FileProviderKind)}
        className="h-9 min-w-28 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {PROVIDERS.map((provider) => (
          <option key={provider.value} value={provider.value}>
            {provider.label}
          </option>
        ))}
      </select>
    </label>
  );
}
