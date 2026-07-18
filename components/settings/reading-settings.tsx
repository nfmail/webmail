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
  const t = useTranslations('settings.email_behavior');
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

      setReorganizeResult(t('archive_mode.reorganize_success', { count: movedCount }));
    } catch (error) {
      console.error('Failed to reorganize archive:', error);
      setReorganizeResult(t('archive_mode.reorganize_error'));
    } finally {
      setIsReorganizing(false);
    }
  };

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      {!isSettingHidden('markAsReadDelay') && (
      <SettingItem label={t('mark_read.label')} description={t('mark_read.description')} locked={isSettingLocked('markAsReadDelay')} htmlFor="reading-mark-read-delay">
        <Select
          id="reading-mark-read-delay"
          value={markAsReadDelay.toString()}
          onChange={(value) => updateSetting('markAsReadDelay', parseInt(value))}
          options={[
            { value: '0', label: t('mark_read.instant') },
            { value: '3000', label: t('mark_read.delay_3s') },
            { value: '5000', label: t('mark_read.delay_5s') },
            { value: '-1', label: t('mark_read.never') },
          ]}
        />
      </SettingItem>
      )}

      {!isSettingHidden('deleteAction') && (
      <SettingItem label={t('delete_action.label')} description={t('delete_action.description')} locked={isSettingLocked('deleteAction')} htmlFor="reading-delete-action">
        <div className="flex flex-col gap-2">
          <Select
            id="reading-delete-action"
            value={deleteAction}
            onChange={(value) => updateSetting('deleteAction', value as 'trash' | 'trash-and-read' | 'permanent')}
            options={[
              { value: 'trash', label: t('delete_action.trash') },
              { value: 'trash-and-read', label: t('delete_action.trash_and_read') },
              { value: 'permanent', label: t('delete_action.permanent') },
            ]}
          />
          {deleteAction === 'permanent' && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t('delete_action.warning')}</span>
            </div>
          )}
        </div>
      </SettingItem>
      )}

      <SettingItem label={t('archive_mode.label')} description={t('archive_mode.description')} htmlFor="reading-archive-mode">
        <div className="flex flex-col gap-2">
          <Select
            id="reading-archive-mode"
            value={archiveMode}
            onChange={(value) => updateSetting('archiveMode', value as ArchiveMode)}
            options={[
              { value: 'single', label: t('archive_mode.single') },
              { value: 'year', label: t('archive_mode.year') },
              { value: 'month', label: t('archive_mode.month') },
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
                <span>{t('archive_mode.reorganize')}</span>
              </button>
              {reorganizeResult && (
                <p className="text-xs text-muted-foreground">{reorganizeResult}</p>
              )}
            </div>
          )}
        </div>
      </SettingItem>

      <SettingItem label={t('permanently_delete_junk.label')} description={t('permanently_delete_junk.description')} htmlFor="reading-permanently-delete-junk">
        <ToggleSwitch
          id="reading-permanently-delete-junk"
          checked={permanentlyDeleteJunk}
          onChange={(checked) => updateSetting('permanentlyDeleteJunk', checked)}
        />
      </SettingItem>

      <SettingItem label={t('return_to_list_after_action.label')} description={t('return_to_list_after_action.description')} htmlFor="reading-return-to-list">
        <ToggleSwitch
          id="reading-return-to-list"
          checked={returnToListAfterAction}
          onChange={(checked) => updateSetting('returnToListAfterAction', checked)}
        />
      </SettingItem>

      {!isSettingHidden('showPreview') && (
      <SettingItem
        label={t('show_preview.label')}
        description={isFocusedLayout ? t('show_preview.focus_description') : t('show_preview.description')}
        locked={isSettingLocked('showPreview')}
        htmlFor="reading-show-preview"
      >
        <ToggleSwitch id="reading-show-preview" checked={showPreview} onChange={(checked) => updateSetting('showPreview', checked)} />
      </SettingItem>
      )}

      <SettingItem label={t('disable_threading.label')} description={t('disable_threading.description')} htmlFor="reading-disable-threading">
        <ToggleSwitch
          id="reading-disable-threading"
          checked={disableThreading}
          onChange={(checked) => updateSetting('disableThreading', checked)}
        />
      </SettingItem>

      <SettingItem label={t('hide_inline_image_attachments.label')} description={t('hide_inline_image_attachments.description')} htmlFor="reading-hide-inline-images">
        <ToggleSwitch
          id="reading-hide-inline-images"
          checked={hideInlineImageAttachments}
          onChange={(checked) => updateSetting('hideInlineImageAttachments', checked)}
        />
      </SettingItem>

      <SettingItem label={t('attachment_image_previews.label')} description={t('attachment_image_previews.description')} htmlFor="reading-attachment-image-previews">
        <ToggleSwitch
          id="reading-attachment-image-previews"
          checked={attachmentImagePreviewsEnabled}
          onChange={(checked) => updateSetting('attachmentImagePreviewsEnabled', checked)}
        />
      </SettingItem>

      {isFeatureEnabled('hoverActionsConfigEnabled') && (
      <div className="py-3 border-b border-border flex flex-col gap-3">
        <Field>
          <FieldLabel>{t('hover_actions.label')}</FieldLabel>
          <FieldDescription>{t('hover_actions.description')}</FieldDescription>
          <ToggleGroup
            type="multiple"
            variant="outline"
            value={hoverActions}
            onValueChange={(next) => updateSetting('hoverActions', next as HoverAction[])}
            aria-label={t('hover_actions.label')}
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
          <FieldLabel className="text-xs">{t('hover_actions.mode_label')}</FieldLabel>
          <RadioGroup
            value={hoverActionsMode}
            onChange={(value) => updateSetting('hoverActionsMode', value as HoverActionsMode)}
            aria-label={t('hover_actions.mode_label')}
            options={[
              { value: 'inline', label: t('hover_actions.mode_inline') },
              { value: 'floating', label: t('hover_actions.mode_floating') },
            ]}
          />
        </Field>

        {hoverActionsMode === 'floating' && (
          <Field className="pt-1">
            <FieldLabel className="text-xs">{t('hover_actions.corner_label')}</FieldLabel>
            <RadioGroup
              value={hoverActionsCorner}
              onChange={(value) => updateSetting('hoverActionsCorner', value as HoverActionsCorner)}
              aria-label={t('hover_actions.corner_label')}
              options={[
                { value: 'top-left', label: t('hover_actions.corner_top-left') },
                { value: 'top-right', label: t('hover_actions.corner_top-right') },
                { value: 'bottom-left', label: t('hover_actions.corner_bottom-left') },
                { value: 'bottom-right', label: t('hover_actions.corner_bottom-right') },
              ]}
            />
          </Field>
        )}
      </div>
      )}

      <SettingItem label={t('attachment_click_action.label')} description={t('attachment_click_action.description')} htmlFor="reading-attachment-click-action">
        <Select
          id="reading-attachment-click-action"
          value={mailAttachmentAction}
          onChange={(value) => updateSetting('mailAttachmentAction', value as 'preview' | 'download')}
          options={[
            { value: 'preview', label: t('attachment_click_action.preview') },
            { value: 'download', label: t('attachment_click_action.download') },
          ]}
        />
      </SettingItem>

      <SettingItem label={t('attachment_position.label')} description={t('attachment_position.description')} htmlFor="reading-attachment-position">
        <Select
          id="reading-attachment-position"
          value={attachmentPosition}
          onChange={(value) => updateSetting('attachmentPosition', value as 'beside-sender' | 'below-header')}
          options={[
            { value: 'beside-sender', label: t('attachment_position.beside-sender') },
            { value: 'below-header', label: t('attachment_position.below-header') },
          ]}
        />
      </SettingItem>

      {!isSettingHidden('emailsPerPage') && (
      <SettingItem label={t('emails_per_page.label')} description={t('emails_per_page.description')} locked={isSettingLocked('emailsPerPage')} htmlFor="reading-emails-per-page">
        <Select
          id="reading-emails-per-page"
          value={emailsPerPage.toString()}
          onChange={(value) => updateSetting('emailsPerPage', parseInt(value))}
          options={[
            { value: '10', label: t('emails_per_page.10') },
            { value: '25', label: t('emails_per_page.25') },
            { value: '50', label: t('emails_per_page.50') },
            { value: '100', label: t('emails_per_page.100') },
          ]}
        />
      </SettingItem>
      )}
    </SettingsSection>
  );
}
