"use client";

import { useMemo, useRef } from "react";
import { useTranslations } from "@/i18n/client";
import { useSettingsStore } from "@/stores/settings-store";
import { SettingsSection, SettingItem, Select, ToggleSwitch } from "./settings-section";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ATTACHMENT_TEMPLATE,
  DEFAULT_BUNDLE_TEMPLATE,
  DEFAULT_EMAIL_TEMPLATE,
  EMAIL_TOKENS,
  ATTACHMENT_TOKENS,
  BUNDLE_TOKENS,
  bundleExportFilename,
  emailExportFilename,
  attachmentDownloadFilename,
  buildSampleEmail,
  type EmailFilenameOptions,
} from "@/lib/download-filename";

function insertTokenAtCursor(
  input: HTMLInputElement,
  token: string,
  current: string,
  onChange: (next: string) => void,
): void {
  const start = input.selectionStart ?? current.length;
  const end = input.selectionEnd ?? current.length;
  const before = current.slice(0, start);
  const after = current.slice(end);
  const insertion = `{${token}}`;
  const next = `${before}${insertion}${after}`;
  onChange(next);
  // Restore focus and place caret after the inserted token.
  requestAnimationFrame(() => {
    input.focus();
    const caret = before.length + insertion.length;
    input.setSelectionRange(caret, caret);
  });
}

interface TemplateEditorProps {
  id: string;
  label: string;
  description: string;
  value: string;
  defaultValue: string;
  tokens: { token: string; description: string }[];
  preview: string;
  onChange: (next: string) => void;
  resetLabel: string;
  previewLabel: string;
  placeholder?: string;
}

function TemplateEditor({
  id,
  label,
  description,
  value,
  defaultValue,
  tokens,
  preview,
  onChange,
  resetLabel,
  previewLabel,
  placeholder,
}: TemplateEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div data-search-label={label} className="py-3 border-b border-border last:border-0">
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
        <div className="flex items-stretch gap-2">
          <Input
            id={id}
            ref={inputRef}
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="font-mono"
          />
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            disabled={value === defaultValue}
            title={resetLabel}
            className={cn(
              "px-2 rounded-md border border-border text-foreground transition-colors duration-150",
              value === defaultValue
                ? "opacity-40 cursor-not-allowed"
                : "hover:bg-muted cursor-pointer",
            )}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tokens.map((t) => (
            <button
              key={t.token}
              type="button"
              title={t.description}
              onClick={() => {
                const input = inputRef.current;
                if (!input) {
                  onChange(`${value}{${t.token}}`);
                  return;
                }
                insertTokenAtCursor(input, t.token, value, onChange);
              }}
              className="px-2 py-0.5 text-xs font-mono rounded bg-muted hover:bg-accent border border-border text-foreground transition-colors duration-150 cursor-pointer"
            >
              {`{${t.token}}`}
            </button>
          ))}
        </div>
        <FieldDescription>
          <span className="opacity-70">{previewLabel} </span>
          <span className="font-mono text-foreground break-all">{preview}</span>
        </FieldDescription>
      </Field>
    </div>
  );
}

export function DownloadsSettings() {
  const t = useTranslations();
  const {
    emailDownloadTemplate,
    attachmentDownloadTemplate,
    bundleDownloadTemplate,
    filenameSpaceReplacement,
    filenameLowercase,
    filenameStripDiacritics,
    filenameCollapseSeparators,
    postExportAction,
    updateSetting,
  } = useSettingsStore();

  const sampleEmail = useMemo(() => buildSampleEmail(), []);
  const sampleAttachment = useMemo(() => ({ name: "Invoice-2026-05.pdf", type: "application/pdf" }), []);

  const transform = useMemo(
    () => ({
      spaceReplacement: filenameSpaceReplacement,
      lowercase: filenameLowercase,
      stripDiacritics: filenameStripDiacritics,
      collapseSeparators: filenameCollapseSeparators,
    }),
    [filenameSpaceReplacement, filenameLowercase, filenameStripDiacritics, filenameCollapseSeparators],
  );

  const emailOptions: EmailFilenameOptions = useMemo(
    () => ({ ...transform, template: emailDownloadTemplate || DEFAULT_EMAIL_TEMPLATE }),
    [transform, emailDownloadTemplate],
  );
  const attachmentOptions: EmailFilenameOptions = useMemo(
    () => ({ ...transform, template: attachmentDownloadTemplate || DEFAULT_ATTACHMENT_TEMPLATE }),
    [transform, attachmentDownloadTemplate],
  );
  const bundleOptions: EmailFilenameOptions = useMemo(
    () => ({ ...transform, template: bundleDownloadTemplate || DEFAULT_BUNDLE_TEMPLATE }),
    [transform, bundleDownloadTemplate],
  );

  const emlPreview = useMemo(
    () => emailExportFilename(sampleEmail, emailOptions),
    [sampleEmail, emailOptions],
  );
  const attachmentPreview = useMemo(
    () => attachmentDownloadFilename(sampleEmail, sampleAttachment, attachmentOptions),
    [sampleEmail, sampleAttachment, attachmentOptions],
  );
  const bundlePreview = useMemo(
    // Render with the email's fixed sample date so the preview is stable as the
    // user types in the template field.
    () => bundleExportFilename(3, bundleOptions, sampleEmail.receivedAt ?? undefined),
    [bundleOptions, sampleEmail],
  );

  return (
    <SettingsSection title={t("Downloads")} description={t("Customize how downloaded emails and attachments are named.")}>
      <TemplateEditor
        id="downloads-email-template"
        label={t("Email (.eml) filename")}
        description={t("Template used when you export an email or drag one out to the file system. The .eml extension is added automatically.")}
        value={emailDownloadTemplate}
        defaultValue={DEFAULT_EMAIL_TEMPLATE}
        tokens={EMAIL_TOKENS}
        preview={emlPreview}
        onChange={(next) => updateSetting("emailDownloadTemplate", next)}
        resetLabel={t("Restore default")}
        previewLabel={t("Preview:")}
        placeholder={DEFAULT_EMAIL_TEMPLATE}
      />
      <TemplateEditor
        id="downloads-attachment-template"
        label={t("Attachment filename")}
        description={t("Template used when downloading or dragging out an attachment. If you omit '{filename}' and '{ext}', the original extension is preserved.")}
        value={attachmentDownloadTemplate}
        defaultValue={DEFAULT_ATTACHMENT_TEMPLATE}
        tokens={ATTACHMENT_TOKENS}
        preview={attachmentPreview}
        onChange={(next) => updateSetting("attachmentDownloadTemplate", next)}
        resetLabel={t("Restore default")}
        previewLabel={t("Preview:")}
        placeholder={DEFAULT_ATTACHMENT_TEMPLATE}
      />
      <TemplateEditor
        id="downloads-bundle-template"
        label={t("Multi-email .zip filename")}
        description={t("Template used when you drag out or download several selected emails as a single .zip archive. The .zip extension is added automatically.")}
        value={bundleDownloadTemplate}
        defaultValue={DEFAULT_BUNDLE_TEMPLATE}
        tokens={BUNDLE_TOKENS}
        preview={bundlePreview}
        onChange={(next) => updateSetting("bundleDownloadTemplate", next)}
        resetLabel={t("Restore default")}
        previewLabel={t("Preview:")}
        placeholder={DEFAULT_BUNDLE_TEMPLATE}
      />
      <SettingItem label={t("Spaces")} description={t("Replace spaces in the resulting filename with another character.")} htmlFor="downloads-space-replacement">
        <Select
          id="downloads-space-replacement"
          value={filenameSpaceReplacement}
          onChange={(value) => updateSetting("filenameSpaceReplacement", value as "keep" | "underscore" | "dash")}
          options={[
            { value: "keep", label: t("Keep spaces") },
            { value: "underscore", label: t("Replace with _") },
            { value: "dash", label: t("Replace with -") },
          ]}
        />
      </SettingItem>
      <SettingItem label={t("Lowercase")} description={t("Force the entire filename to lowercase.")} htmlFor="downloads-lowercase">
        <ToggleSwitch
          id="downloads-lowercase"
          checked={filenameLowercase}
          onChange={(checked) => updateSetting("filenameLowercase", checked)}
        />
      </SettingItem>
      <SettingItem label={t("Strip diacritics")} description={t("Convert accented letters to their ASCII equivalents (ä → a, é → e). Useful for tools that mangle Unicode filenames.")} htmlFor="downloads-strip-diacritics">
        <ToggleSwitch
          id="downloads-strip-diacritics"
          checked={filenameStripDiacritics}
          onChange={(checked) => updateSetting("filenameStripDiacritics", checked)}
        />
      </SettingItem>
      <SettingItem label={t("Collapse repeated separators")} description={t("Collapse runs of spaces, underscores, or dashes to a single character.")} htmlFor="downloads-collapse-separators">
        <ToggleSwitch
          id="downloads-collapse-separators"
          checked={filenameCollapseSeparators}
          onChange={(checked) => updateSetting("filenameCollapseSeparators", checked)}
        />
      </SettingItem>
      <SettingItem label={t("After export")} description={t("Optionally move the email after exporting it as .eml.")} htmlFor="downloads-post-export-action">
        <Select
          id="downloads-post-export-action"
          value={postExportAction}
          onChange={(value) => updateSetting("postExportAction", value as "keep" | "archive" | "trash")}
          options={[
            { value: "keep", label: t("Keep in mailbox") },
            { value: "archive", label: t("Move to archive") },
            { value: "trash", label: t("Move to trash") },
          ]}
        />
      </SettingItem>
    </SettingsSection>
  );
}
