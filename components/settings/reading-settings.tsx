"use client";

import { useState } from 'react';
import { useTranslations } from '@/i18n/client';
import { useSettingsStore } from '@/stores/settings-store';
import type { ArchiveMode, HoverAction, HoverActionsMode, HoverActionsCorner } from '@/stores/settings-store';
import { ALL_HOVER_ACTIONS } from '@/stores/settings-store';
import { useAuthStore } from '@/stores/auth-store';
import { useEmailStore } from '@/stores/email-store';
import { SettingsSection, SettingItem, Select, ToggleSwitch, RadioGroup } from './settings-section';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AlertTriangle, FolderSync, Loader2 } from 'lucide-react';
import { usePolicyStore } from '@/stores/policy-store';

export function ReadingSettings() {
  const t = useTranslations();
  const [isReorganizing, setIsReorganizing] = useState(false);
  const [reorganizeResult, setReorganizeResult] = useState<string | null>(null);
  const { isSettingLocked, isSettingHidden, isFeatureEnabled } = usePolicyStore();

  const {
    markAsReadDelay,
    deleteAction,
    permanentlyDeleteJunk,
    returnToListAfterAction,
    showPreview,
    mailLayout,
    disableThreading,
    emailsPerPage,
    mailAttachmentAction,
    attachmentPosition,
    archiveMode,
    hoverActions,
    hoverActionsMode,
    hoverActionsCorner,
    hideInlineImageAttachments,
    attachmentImagePreviewsEnabled,
    updateSetting,
  } = useSettingsStore();

  const isFocusedLayout = mailLayout === 'focus';

  const handleReorganizeArchive = async () => {
    const { client } = useAuthStore.getState();
    const { mailboxes, fetchMailboxes } = useEmailStore.getState();
    if (!client) return;

    const archiveMailbox = mailboxes.find(m => m.role === 'archive' || m.name.toLowerCase() === 'archive');
    if (!archiveMailbox) return;

    setIsReorganizing(true);
    setReorganizeResult(null);

    try {
      const archiveId = archiveMailbox.originalId || archiveMailbox.id;
      const emails = await client.getEmailsInMailbox(archiveId);
      let movedCount = 0;

      for (const email of emails) {
        const emailDate = new Date(email.receivedAt);
        const year = emailDate.getFullYear().toString();
        const month = (emailDate.getMonth() + 1).toString().padStart(2, '0');

        let currentMailboxes = useEmailStore.getState().mailboxes;

        let yearMailbox = currentMailboxes.find(
          m => m.name === year && m.parentId === archiveId
        );
        if (!yearMailbox) {
          yearMailbox = await client.createMailbox(year, archiveId);
          await fetchMailboxes(client);
          currentMailboxes = useEmailStore.getState().mailboxes;
        }

        if (archiveMode === 'year') {
          await client.moveEmail(email.id, yearMailbox.id);
          movedCount++;
        } else {
          const yearId = yearMailbox.originalId || yearMailbox.id;
          let monthMailbox = currentMailboxes.find(
            m => m.name === month && m.parentId === yearId
          );
          if (!monthMailbox) {
            monthMailbox = await client.createMailbox(month, yearId);
            await fetchMailboxes(client);
          }
          await client.moveEmail(email.id, monthMailbox.id);
          movedCount++;
        }
      }

      setReorganizeResult(t("{count, plural, =0 {No emails to reorganize} =1 {1 email reorganized} other {# emails reorganized}}", { count: movedCount }));
    } catch (error) {
      console.error('Failed to reorganize archive:', error);
      setReorganizeResult(t("Failed to reorganize archive"));
    } finally {
      setIsReorganizing(false);
    }
  };

  return (
    <SettingsSection title={t("Email Behavior")} description={t("Configure how emails are handled")}>
      {!isSettingHidden('markAsReadDelay') && (
      <SettingItem label={t("Mark as Read")} description={t("When to mark emails as read when opened")} locked={isSettingLocked('markAsReadDelay')} htmlFor="reading-mark-read-delay">
        <Select
          id="reading-mark-read-delay"
          value={markAsReadDelay.toString()}
          onChange={(value) => updateSetting('markAsReadDelay', parseInt(value))}
          options={[
            { value: '0', label: t("Instantly") },
            { value: '3000', label: t("After 3 seconds") },
            { value: '5000', label: t("After 5 seconds") },
            { value: '-1', label: t("Never") },
          ]}
        />
      </SettingItem>
      )}

      {!isSettingHidden('deleteAction') && (
      <SettingItem label={t("Delete Action")} description={t("What happens when you delete an email")} locked={isSettingLocked('deleteAction')} htmlFor="reading-delete-action">
        <div className="flex flex-col gap-2">
          <Select
            id="reading-delete-action"
            value={deleteAction}
            onChange={(value) => updateSetting('deleteAction', value as 'trash' | 'trash-and-read' | 'permanent')}
            options={[
              { value: 'trash', label: t("Move to Trash") },
              { value: 'trash-and-read', label: t("Move to Trash and mark as read") },
              { value: 'permanent', label: t("Delete Permanently") },
            ]}
          />
          {deleteAction === 'permanent' && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t("Emails will be permanently deleted and cannot be recovered. This action is irreversible.")}</span>
            </div>
          )}
        </div>
      </SettingItem>
      )}

      <SettingItem label={t("Archive in")} description={t("How to organize emails when archiving")} htmlFor="reading-archive-mode">
        <div className="flex flex-col gap-2">
          <Select
            id="reading-archive-mode"
            value={archiveMode}
            onChange={(value) => updateSetting('archiveMode', value as ArchiveMode)}
            options={[
              { value: 'single', label: t("A single folder") },
              { value: 'year', label: t("A folder per year") },
              { value: 'month', label: t("A folder per month") },
            ]}
          />
          {archiveMode !== 'single' && (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleReorganizeArchive}
                disabled={isReorganizing}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent rounded-md transition-colors text-sm disabled:opacity-50"
              >
                {isReorganizing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FolderSync className="w-4 h-4" />
                )}
                <span>{t("Reorganize existing archive")}</span>
              </button>
              {reorganizeResult && (
                <p className="text-xs text-muted-foreground">{reorganizeResult}</p>
              )}
            </div>
          )}
        </div>
      </SettingItem>

      <SettingItem label={t("Permanently Delete Junk")} description={t("Permanently delete emails from the Junk/Spam folder instead of moving them to Trash")} htmlFor="reading-permanently-delete-junk">
        <ToggleSwitch
          id="reading-permanently-delete-junk"
          checked={permanentlyDeleteJunk}
          onChange={(checked) => updateSetting('permanentlyDeleteJunk', checked)}
        />
      </SettingItem>

      <SettingItem label={t("Return to list after delete or mark unread")} description={t("After deleting or marking the open message unread, go back to the message list instead of opening the next message.")} htmlFor="reading-return-to-list">
        <ToggleSwitch
          id="reading-return-to-list"
          checked={returnToListAfterAction}
          onChange={(checked) => updateSetting('returnToListAfterAction', checked)}
        />
      </SettingItem>

      {!isSettingHidden('showPreview') && (
      <SettingItem
        label={t("Show Preview Text")}
        description={isFocusedLayout ? t("Display inline preview text inside the focused one-line message list") : t("Display email preview in the list")}
        locked={isSettingLocked('showPreview')}
        htmlFor="reading-show-preview"
      >
        <ToggleSwitch id="reading-show-preview" checked={showPreview} onChange={(checked) => updateSetting('showPreview', checked)} />
      </SettingItem>
      )}

      <SettingItem label={t("Disable Conversation Grouping")} description={t("Show emails as individual messages instead of grouped by conversation")} htmlFor="reading-disable-threading">
        <ToggleSwitch
          id="reading-disable-threading"
          checked={disableThreading}
          onChange={(checked) => updateSetting('disableThreading', checked)}
        />
      </SettingItem>

      <SettingItem label={t("Hide inline images from attachments")} description={t("Images embedded in the message body are not listed as separate attachments")} htmlFor="reading-hide-inline-images">
        <ToggleSwitch
          id="reading-hide-inline-images"
          checked={hideInlineImageAttachments}
          onChange={(checked) => updateSetting('hideInlineImageAttachments', checked)}
        />
      </SettingItem>

      <SettingItem label={t("Show image previews in attachments")} description={t("Render image attachments as thumbnail cards instead of generic file icons")} htmlFor="reading-attachment-image-previews">
        <ToggleSwitch
          id="reading-attachment-image-previews"
          checked={attachmentImagePreviewsEnabled}
          onChange={(checked) => updateSetting('attachmentImagePreviewsEnabled', checked)}
        />
      </SettingItem>

      {isFeatureEnabled('hoverActionsConfigEnabled') && (
      <div className="py-3 border-b border-border flex flex-col gap-3">
        <Field>
          <FieldLabel>{t("Quick Hover Actions")}</FieldLabel>
          <FieldDescription>{t("Choose which quick actions appear when hovering over an email in the list")}</FieldDescription>
          <ToggleGroup
            type="multiple"
            variant="outline"
            value={hoverActions}
            onValueChange={(next) => updateSetting('hoverActions', next as HoverAction[])}
            aria-label={t("Quick Hover Actions")}
            className="flex flex-wrap gap-2"
          >
            {ALL_HOVER_ACTIONS.map((action) => (
              <ToggleGroupItem key={action.id} value={action.id} className="text-xs">
                {t(`hover_actions.${action.labelKey}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <Field className="pt-2">
          <FieldLabel className="text-xs">{t("Display Mode")}</FieldLabel>
          <RadioGroup
            value={hoverActionsMode}
            onChange={(value) => updateSetting('hoverActionsMode', value as HoverActionsMode)}
            aria-label={t("Display Mode")}
            options={[
              { value: 'inline', label: t("Inline") },
              { value: 'floating', label: t("Floating") },
            ]}
          />
        </Field>

        {hoverActionsMode === 'floating' && (
          <Field className="pt-1">
            <FieldLabel className="text-xs">{t("Floating Position")}</FieldLabel>
            <RadioGroup
              value={hoverActionsCorner}
              onChange={(value) => updateSetting('hoverActionsCorner', value as HoverActionsCorner)}
              aria-label={t("Floating Position")}
              options={[
                { value: 'top-left', label: t("Top Left") },
                { value: 'top-right', label: t("Top Right") },
                { value: 'bottom-left', label: t("Bottom Left") },
                { value: 'bottom-right', label: t("Bottom Right") },
              ]}
            />
          </Field>
        )}
      </div>
      )}

      <SettingItem label={t("Attachment Click Action")} description={t("Choose whether clicking a file attachment previews it or downloads it immediately")} htmlFor="reading-attachment-click-action">
        <Select
          id="reading-attachment-click-action"
          value={mailAttachmentAction}
          onChange={(value) => updateSetting('mailAttachmentAction', value as 'preview' | 'download')}
          options={[
            { value: 'preview', label: t("Preview when possible") },
            { value: 'download', label: t("Download immediately") },
          ]}
        />
      </SettingItem>

      <SettingItem label={t("Attachment Position")} description={t("Where to display attachments in the email header")} htmlFor="reading-attachment-position">
        <Select
          id="reading-attachment-position"
          value={attachmentPosition}
          onChange={(value) => updateSetting('attachmentPosition', value as 'beside-sender' | 'below-header')}
          options={[
            { value: 'beside-sender', label: t("Next to sender") },
            { value: 'below-header', label: t("Below header") },
          ]}
        />
      </SettingItem>

      {!isSettingHidden('emailsPerPage') && (
      <SettingItem label={t("Emails Per Page")} description={t("Number of emails to load at once")} locked={isSettingLocked('emailsPerPage')} htmlFor="reading-emails-per-page">
        <Select
          id="reading-emails-per-page"
          value={emailsPerPage.toString()}
          onChange={(value) => updateSetting('emailsPerPage', parseInt(value))}
          options={[
            { value: '10', label: t("10 emails") },
            { value: '25', label: t("25 emails") },
            { value: '50', label: t("50 emails") },
            { value: '100', label: t("100 emails") },
          ]}
        />
      </SettingItem>
      )}
    </SettingsSection>
  );
}
