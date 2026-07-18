"use client";

import { useMemo } from 'react';
import { useTranslations } from '@/i18n/client';
import { Folder } from 'lucide-react';
import { useSettingsStore, type ToolbarPosition, type MailLayout } from '@/stores/settings-store';
import { SettingsSection, SettingItem, RadioGroup, ToggleSwitch } from './settings-section';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { usePolicyStore } from '@/stores/policy-store';
import { useAccountStore } from '@/stores/account-store';
import { useEmailStore } from '@/stores/email-store';

const MAIL_LAYOUT_PREVIEW_ROWS = [
  { sender: 'Alice', subject: 'Quarterly roadmap', preview: 'The draft is ready for review.', selected: false },
  { sender: 'Nadia', subject: 'Design sync', preview: 'Pushed updated mocks and notes.', selected: true },
  { sender: 'Billing', subject: 'Invoice 1042', preview: 'Your receipt is attached.', selected: false },
];

const MAIL_LAYOUT_PREVIEW_ROWS_FOCUS = [
  ...MAIL_LAYOUT_PREVIEW_ROWS,
  { sender: 'Sam', subject: 'Lunch?', preview: '', selected: false },
  { sender: 'Newsletter', subject: 'Weekly digest', preview: '', selected: false },
];

function MailLayoutPreview({
  value,
  t,
}: {
  value: MailLayout;
  t: (key: string) => string;
}) {
  return (
    <div className="mt-3 rounded-xl border border-border bg-background p-3">
      <div>
        <div className="text-sm font-medium text-foreground">{t(`mail_layout.${value}`)}</div>
        <div className="mt-1 text-xs text-muted-foreground">{t(`mail_layout.${value}_description`)}</div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-muted/20">
        <div className="flex h-28">
          <div className="w-11 border-e border-border bg-muted/40" />

          {value === 'split' && (
            <>
              <div className="w-28 border-e border-border bg-background">
                {MAIL_LAYOUT_PREVIEW_ROWS.map((row) => (
                  <div
                    key={row.subject}
                    className={cn(
                      'border-b border-border px-2 py-1.5 text-[10px] last:border-b-0',
                      row.selected && 'bg-primary/10'
                    )}
                  >
                    <div className="truncate font-medium text-foreground">{row.sender}</div>
                    <div className="truncate text-muted-foreground">{row.subject}</div>
                  </div>
                ))}
              </div>
              <div className="flex-1 bg-background px-3 py-2">
                <div className="h-2.5 w-20 rounded bg-foreground/10" />
                <div className="mt-2 h-2 w-full rounded bg-foreground/10" />
                <div className="mt-1.5 h-2 w-5/6 rounded bg-foreground/10" />
                <div className="mt-1.5 h-2 w-2/3 rounded bg-foreground/10" />
              </div>
            </>
          )}

          {value === 'focus' && (
            <div className="flex-1 bg-background">
              {MAIL_LAYOUT_PREVIEW_ROWS_FOCUS.map((row) => (
                <div
                  key={row.subject}
                  className={cn(
                    'border-b border-border px-2 py-1 text-[10px] last:border-b-0',
                    row.selected && 'bg-primary/10'
                  )}
                >
                  <div className="truncate text-foreground">
                    <span className="font-medium">{row.sender}</span>
                    <span className="mx-1.5 text-muted-foreground">{row.subject}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {value === 'horizontal' && (
            <div className="flex-1 flex flex-col bg-background">
              <div className="border-b border-border bg-background">
                {MAIL_LAYOUT_PREVIEW_ROWS.map((row) => (
                  <div
                    key={row.subject}
                    className={cn(
                      'border-b border-border px-2 py-1 text-[10px] last:border-b-0',
                      row.selected && 'bg-primary/10'
                    )}
                  >
                    <div className="truncate text-foreground">
                      <span className="font-medium">{row.sender}</span>
                      <span className="mx-1.5 text-muted-foreground">{row.subject}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex-1 bg-background px-3 py-2">
                <div className="h-2 w-20 rounded bg-foreground/10" />
                <div className="mt-1.5 h-1.5 w-full rounded bg-foreground/10" />
                <div className="mt-1 h-1.5 w-5/6 rounded bg-foreground/10" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function LayoutSettings() {
  const t = useTranslations();
  const tEmail = useTranslations();
  const { toolbarPosition, showToolbarLabels, hideAccountSwitcher, showRailAccountList, enableUnifiedMailbox, includeGroupInUnified, enableAllMailView, allMailFolderIds, enableCrossUnreadView, enableCrossStarredView, enableCrossAllView, colorfulSidebarIcons, tintListRowsByTag, showFolderTotalCount, mailLayout, proInterface, updateSetting } = useSettingsStore();
  const { isSettingLocked, isSettingHidden, isFeatureEnabled } = usePolicyStore();
  const accounts = useAccountStore(s => s.accounts);
  const activeAccountId = useAccountStore(s => s.activeAccountId);
  const mailboxes = useEmailStore(s => s.mailboxes);
  const hasGroupInboxes = useMemo(() => mailboxes.some(m => m.isShared), [mailboxes]);
  const allMailViewAllowed = isFeatureEnabled('allMailViewEnabled');
  // Cross-account "All accounts" views, each gated independently by the admin.
  const crossViews = [
    { setting: 'enableCrossUnreadView', value: enableCrossUnreadView, allowed: isFeatureEnabled('crossUnreadViewEnabled'), labelKey: 'cross_unread.label', descKey: 'cross_unread.description' },
    { setting: 'enableCrossStarredView', value: enableCrossStarredView, allowed: isFeatureEnabled('crossStarredViewEnabled'), labelKey: 'cross_starred.label', descKey: 'cross_starred.description' },
    { setting: 'enableCrossAllView', value: enableCrossAllView, allowed: isFeatureEnabled('crossAllViewEnabled'), labelKey: 'cross_all.label', descKey: 'cross_all.description' },
  ] as const;

  // Own (non-shared) folders and the active account's All Mail selection. The
  // selection is per account: a missing entry = never configured, which
  // defaults to all no-role folders; an explicit [] = no folders.
  const ownMailboxes = useMemo(() => mailboxes.filter(m => !m.isShared), [mailboxes]);
  const currentAllMailEntry = activeAccountId ? allMailFolderIds[activeAccountId] : undefined;
  const allMailSelected = new Set(
    currentAllMailEntry === undefined
      ? ownMailboxes.filter(m => !m.role).map(m => m.id)
      : currentAllMailEntry
  );
  const toggleAllMailFolder = (id: string) => {
    if (!activeAccountId) return;
    const next = new Set(allMailSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateSetting('allMailFolderIds', {
      ...allMailFolderIds,
      [activeAccountId]: ownMailboxes.filter(m => next.has(m.id)).map(m => m.id),
    });
  };
  // Name the account the selection applies to, but only when more than one is
  // logged in (otherwise it's unambiguous).
  const activeAccount = accounts.find(a => a.id === activeAccountId);
  const allMailAccountHint = accounts.length > 1 && activeAccount
    ? t("Applies to {account}.", { account: activeAccount.displayName || activeAccount.email })
    : null;

  return (
    <SettingsSection title={t("Appearance")} description={t("Customize the look and feel of your webmail")}>
      {!isSettingHidden('mailLayout') && (
      <SettingItem label={tEmail("Mail Layout")} description={tEmail("Choose between the classic split reading pane, a Gmail-style focused reading flow, or a Zimbra-style bottom reading pane.")} locked={isSettingLocked('mailLayout')}>
        <div className="w-[22rem] max-w-full">
          <RadioGroup
            value={mailLayout}
            onChange={(value) => updateSetting('mailLayout', value as MailLayout)}
            aria-label={tEmail("Mail Layout")}
            options={[
              { value: 'split', label: tEmail("Split pane") },
              { value: 'focus', label: tEmail("Focused list") },
              { value: 'horizontal', label: tEmail("Reading pane at bottom") },
            ]}
          />
          <MailLayoutPreview value={mailLayout} t={tEmail} />
        </div>
      </SettingItem>
      )}

      <SettingItem label={t("Toolbar Position")} description={t("Where to show email action buttons (Reply, Archive, Delete, etc.)")}>
        <RadioGroup
          value={toolbarPosition}
          onChange={(value) => updateSetting('toolbarPosition', value as ToolbarPosition)}
          aria-label={t("Toolbar Position")}
          options={[
            { value: 'top', label: t("Top") },
            { value: 'below-subject', label: t("Below subject") },
          ]}
        />
      </SettingItem>

      <SettingItem label={t("Show Toolbar Labels")} description={t("Display text labels next to toolbar icons. Disable to save space once you are familiar with the icons.")} htmlFor="layout-toolbar-labels">
        <ToggleSwitch
          id="layout-toolbar-labels"
          checked={showToolbarLabels}
          onChange={(checked) => updateSetting('showToolbarLabels', checked)}
        />
      </SettingItem>

      <SettingItem label={t("Hide Sidebar Account Switcher")} description={t("Hide the account selector at the top of the folder sidebar. You can still switch accounts from the bottom navigation rail.")} htmlFor="layout-hide-account-switcher">
        <ToggleSwitch
          id="layout-hide-account-switcher"
          checked={hideAccountSwitcher}
          onChange={(checked) => updateSetting('hideAccountSwitcher', checked)}
        />
      </SettingItem>

      <SettingItem label={t("Show Account Avatars on Navigation Rail")} description={t("Display individual account circles at the bottom of the navigation rail for quick switching, with a sign-out button below.")} htmlFor="layout-show-rail-account-list">
        <ToggleSwitch
          id="layout-show-rail-account-list"
          checked={showRailAccountList}
          onChange={(checked) => updateSetting('showRailAccountList', checked)}
        />
      </SettingItem>

      <SettingItem label={t("Colorful Sidebar Icons")} description={t("Tint folder and tag icons by type (blue Inbox, red Junk, green Sent, etc.). Disable for a monochrome sidebar.")} htmlFor="layout-colorful-sidebar-icons">
        <ToggleSwitch
          id="layout-colorful-sidebar-icons"
          checked={colorfulSidebarIcons}
          onChange={(checked) => updateSetting('colorfulSidebarIcons', checked)}
        />
      </SettingItem>

      <SettingItem label={t("Tint List Rows by Tag Color")} description={t("Shade each message row with its first tag color. Disable to keep rows plain; tag dots and chips still show the color.")} htmlFor="layout-tint-list-rows">
        <ToggleSwitch
          id="layout-tint-list-rows"
          checked={tintListRowsByTag}
          onChange={(checked) => updateSetting('tintListRowsByTag', checked)}
        />
      </SettingItem>

      <SettingItem label={t("Show Total Message Count")} description={t("Show the total message count next to folders and tags, alongside the unread count. Disable to show only unread counts.")} htmlFor="layout-show-folder-total-count">
        <ToggleSwitch
          id="layout-show-folder-total-count"
          checked={showFolderTotalCount}
          onChange={(checked) => updateSetting('showFolderTotalCount', checked)}
        />
      </SettingItem>

      {(accounts.length > 1 || hasGroupInboxes) && !isSettingHidden('enableUnifiedMailbox') && (
        <SettingItem
          label={t("Unified Mailbox")}
          description={t("Show combined folders (Inbox, Sent, etc.) across all connected accounts")}
          locked={isSettingLocked('enableUnifiedMailbox')}
          htmlFor="layout-unified-mailbox"
        >
          <ToggleSwitch
            id="layout-unified-mailbox"
            checked={enableUnifiedMailbox}
            onChange={(v) => updateSetting('enableUnifiedMailbox', v)}
          />
        </SettingItem>
      )}

      {enableUnifiedMailbox && hasGroupInboxes && !isSettingHidden('includeGroupInUnified') && (
        <div className="ms-4 border-s-2 border-border ps-4 -mt-2">
          <SettingItem
            label={t("Include group inboxes")}
            description={t("Also merge shared/group inboxes into the unified view.")}
            locked={isSettingLocked('includeGroupInUnified')}
            htmlFor="layout-include-group-in-unified"
          >
            <ToggleSwitch
              id="layout-include-group-in-unified"
              checked={includeGroupInUnified}
              onChange={(v) => updateSetting('includeGroupInUnified', v)}
            />
          </SettingItem>
        </div>
      )}

      {enableUnifiedMailbox && crossViews.some(c => c.allowed) && (
        <div className="ms-4 border-s-2 border-border ps-4 -mt-2 flex flex-col gap-2">
          {crossViews.map(({ setting, value, allowed, labelKey, descKey }) => (
            allowed && !isSettingHidden(setting) && (
              <SettingItem
                key={setting}
                label={t(labelKey)}
                description={t(descKey)}
                locked={isSettingLocked(setting)}
                htmlFor={`layout-${setting}`}
              >
                <ToggleSwitch
                  id={`layout-${setting}`}
                  checked={value}
                  onChange={(v) => updateSetting(setting, v)}
                />
              </SettingItem>
            )
          ))}
        </div>
      )}

      {allMailViewAllowed && !isSettingHidden('enableAllMailView') && (
        <SettingItem
          label={t("All Mail")}
          description={t("Show an \"All Mail\" entry above your folders that merges messages from across this account's folders into one list.")}
          locked={isSettingLocked('enableAllMailView')}
          htmlFor="layout-all-mail-view"
        >
          <ToggleSwitch
            id="layout-all-mail-view"
            checked={enableAllMailView}
            onChange={(v) => updateSetting('enableAllMailView', v)}
          />
        </SettingItem>
      )}

      {allMailViewAllowed && enableAllMailView && (
        <div className="ms-4 border-s-2 border-border ps-4 -mt-2 flex flex-col gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">{t("Folders in All Mail")}</div>
            <div className="text-xs text-muted-foreground">{t("Choose which folders are merged into the All Mail view.")}</div>
            {allMailAccountHint && (
              <div className="text-xs italic text-muted-foreground mt-0.5">{allMailAccountHint}</div>
            )}
          </div>
          {ownMailboxes.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("No folders available.")}</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {ownMailboxes.map((mb) => {
                const checked = allMailSelected.has(mb.id);
                return (
                  <label
                    key={mb.id}
                    className="w-full flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleAllMailFolder(mb.id)}
                    />
                    <Folder className={cn("w-4 h-4 flex-shrink-0", mb.role ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-sm text-foreground truncate">{mb.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      <SettingItem label={t("Pro Interface (Experimental)")} description={t("Desktop-only power-user layout with multi-tab message browsing and cross-account workflows. The standard interface is unaffected; you can switch back at any time.")} htmlFor="layout-pro-interface">
        <ToggleSwitch
          id="layout-pro-interface"
          checked={proInterface}
          onChange={(v) => updateSetting('proInterface', v)}
        />
      </SettingItem>
    </SettingsSection>
  );
}
