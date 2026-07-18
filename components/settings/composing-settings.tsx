"use client";

import { useState } from 'react';
import { useTranslations } from '@/i18n/client';
import { useSettingsStore } from '@/stores/settings-store';
import type { SendDelaySeconds } from '@/stores/settings-store';
import { useAuthStore } from '@/stores/auth-store';
import { SettingsSection, SettingItem, Select, ToggleSwitch } from './settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { X } from 'lucide-react';
import {
  SUPPORTED_SUB_ADDRESS_DELIMITERS,
  isSupportedSubAddressDelimiter,
  isValidSubAddressDelimiter,
} from '@/lib/sub-addressing';

const CUSTOM_DELIMITER_SENTINEL = '__custom__';
const DEFAULT_CUSTOM_DELIMITER = '~';

export function ComposingSettings() {
  const t = useTranslations();
  const [newKeyword, setNewKeyword] = useState('');

  const {
    autoSelectReplyIdentity,
    plainTextMode,
    rtlEditingSupport,
    attachmentReminderEnabled,
    attachmentReminderKeywords,
    sendDelaySeconds,
    subAddressDelimiter,
    signaturePosition,
    signatureSeparatorEnabled,
    requestReadReceiptDefault,
    readReceiptResponse,
    updateSetting,
  } = useSettingsStore();
  const { client } = useAuthStore();
  const delayedSendSupported = client?.hasDelayedSend() ?? false;

  return (
    <SettingsSection title={t("Email Behavior")} description={t("Configure how emails are handled")}>
      <SettingItem
        label={t("Reply From Received Address")}
        description={t("When replying, send from the address the message was originally sent to. Matches identities first; for domain catch-all deliveries, rewrites the From header to the alias while sending through your primary identity.")}
        htmlFor="auto-select-reply-identity"
      >
        <ToggleSwitch
          id="auto-select-reply-identity"
          checked={autoSelectReplyIdentity}
          onChange={(checked) => updateSetting('autoSelectReplyIdentity', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t("Plain Text Only")}
        description={t("Disable the rich text editor and send all emails as plain text only, including replies and forwards")}
        htmlFor="plain-text-mode"
      >
        <ToggleSwitch
          id="plain-text-mode"
          checked={plainTextMode}
          onChange={(checked) => updateSetting('plainTextMode', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t("Right-to-left editing support")}
        description={t("Adds a direction button to the composer toolbar so you can set paragraphs left-to-right or right-to-left")}
        htmlFor="rtl-editing-support"
      >
        <ToggleSwitch
          id="rtl-editing-support"
          checked={rtlEditingSupport}
          onChange={(checked) => updateSetting('rtlEditingSupport', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t("Undo send / send delay")}
        description={t("Delay normal sends by a short server-side window.")}
        htmlFor="send-delay-select"
      >
        <div className="flex flex-col items-end gap-1">
          <Select
            id="send-delay-select"
            value={String(sendDelaySeconds)}
            onChange={(value) => updateSetting('sendDelaySeconds', Number(value) as SendDelaySeconds)}
            options={[
              { value: '0', label: t("Off") },
              { value: '10', label: t("{seconds} seconds", { seconds: 10 }) },
              { value: '30', label: t("{seconds} seconds", { seconds: 30 }) },
              { value: '60', label: t("{seconds} seconds", { seconds: 60 }) },
            ]}
          />
          {sendDelaySeconds > 0 && !delayedSendSupported && (
            <p className="max-w-64 text-end text-xs text-warning">{t("The current account does not advertise delayed-send support. The setting is still saved for other accounts.")}</p>
          )}
        </div>
      </SettingItem>

      <SettingItem
        label={t("Signature Position")}
        description={t("Where to insert your signature in replies and forwards. Above the quoted text reads naturally as a closing for the reply; below keeps the original message contiguous.")}
        htmlFor="signature-position-select"
      >
        <Select
          id="signature-position-select"
          value={signaturePosition}
          onChange={(value) => updateSetting('signaturePosition', value as 'above_quote' | 'below_quote')}
          options={[
            { value: 'above_quote', label: t("Before quoted text") },
            { value: 'below_quote', label: t("After quoted text") },
          ]}
        />
      </SettingItem>

      <SettingItem
        label={t("Signature Delimiter")}
        description={t("Prefix the signature with the standard \"-- \" delimiter line (RFC 3676). Turn off if you'd rather flow straight from your message into the signature.")}
        htmlFor="signature-separator-enabled"
      >
        <ToggleSwitch
          id="signature-separator-enabled"
          checked={signatureSeparatorEnabled}
          onChange={(checked) => updateSetting('signatureSeparatorEnabled', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t("Request read receipts by default")}
        description={t("Pre-enable the read-receipt request when composing a new message.")}
        htmlFor="request-read-receipt-default"
      >
        <ToggleSwitch
          id="request-read-receipt-default"
          checked={requestReadReceiptDefault}
          onChange={(checked) => updateSetting('requestReadReceiptDefault', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t("Respond to read-receipt requests")}
        description={t("What to do when an incoming message asks for a read receipt.")}
        htmlFor="read-receipt-response-select"
      >
        <Select
          id="read-receipt-response-select"
          value={readReceiptResponse}
          onChange={(value) => updateSetting('readReceiptResponse', value as 'ask' | 'always' | 'never')}
          options={[
            { value: 'ask', label: t("Ask each time") },
            { value: 'always', label: t("Always send") },
            { value: 'never', label: t("Never send") },
          ]}
        />
      </SettingItem>

      <SettingItem
        label={t("Sub-Address Delimiter")}
        description={t("Character separating your username from a sub-address tag. Match the delimiter your mail server uses (e.g. user{delimiter}tag@domain.com).", { delimiter: subAddressDelimiter })}
        htmlFor="sub-address-delimiter-select"
      >
        <div className="flex flex-col items-end gap-2">
          <Select
            id="sub-address-delimiter-select"
            value={isSupportedSubAddressDelimiter(subAddressDelimiter) ? subAddressDelimiter : CUSTOM_DELIMITER_SENTINEL}
            onChange={(value) => {
              if (value === CUSTOM_DELIMITER_SENTINEL) {
                if (isSupportedSubAddressDelimiter(subAddressDelimiter)) {
                  updateSetting('subAddressDelimiter', DEFAULT_CUSTOM_DELIMITER);
                }
              } else {
                updateSetting('subAddressDelimiter', value);
              }
            }}
            options={[
              ...SUPPORTED_SUB_ADDRESS_DELIMITERS.map((delim) => ({
                value: delim,
                label: t("{delimiter}  (user{delimiter}tag@domain.com)", { delimiter: delim }),
              })),
              { value: CUSTOM_DELIMITER_SENTINEL, label: t("Custom…") },
            ]}
          />
          {!isSupportedSubAddressDelimiter(subAddressDelimiter) && (
            <Input
              type="text"
              maxLength={1}
              value={subAddressDelimiter}
              onChange={(e) => {
                const next = e.target.value.slice(0, 1);
                if (next && isValidSubAddressDelimiter(next)) {
                  updateSetting('subAddressDelimiter', next);
                }
              }}
              aria-label={t("Custom delimiter character")}
              placeholder={DEFAULT_CUSTOM_DELIMITER}
              className="w-16 text-center font-mono"
            />
          )}
        </div>
      </SettingItem>

      <SettingItem
        label={t("Attachment Reminder")}
        description={t("Warn before sending when your message mentions attachments but none are attached")}
        htmlFor="attachment-reminder-enabled"
      >
        <ToggleSwitch
          id="attachment-reminder-enabled"
          checked={attachmentReminderEnabled}
          onChange={(checked) => updateSetting('attachmentReminderEnabled', checked)}
        />
      </SettingItem>
      {attachmentReminderEnabled && (
        <div className="border-b border-border py-3">
          <Field>
            <FieldLabel htmlFor="attachment-reminder-new-keyword">
              {t("Trigger keywords")}
            </FieldLabel>
            <FieldDescription>{t("Words or phrases that trigger the reminder when found in your message")}</FieldDescription>
            <div className="flex flex-wrap gap-1.5">
              {attachmentReminderKeywords.map((kw) => (
                <span key={kw} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-foreground">
                  {kw}
                  <button
                    type="button"
                    aria-label={t("Remove")}
                    onClick={() => updateSetting('attachmentReminderKeywords', attachmentReminderKeywords.filter(k => k !== kw))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newKeyword.trim().toLowerCase();
                if (trimmed && !attachmentReminderKeywords.includes(trimmed)) {
                  updateSetting('attachmentReminderKeywords', [...attachmentReminderKeywords, trimmed]);
                }
                setNewKeyword('');
              }}
            >
              <Input
                id="attachment-reminder-new-keyword"
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder={t("Add keyword...")}
                className="flex-1 min-w-0"
              />
              <Button type="submit" variant="secondary" size="sm" disabled={!newKeyword.trim()}>
                {t("Add")}
              </Button>
            </form>
          </Field>
        </div>
      )}
    </SettingsSection>
  );
}
