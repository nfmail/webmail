"use client";

import { useEffect, useState } from 'react';
import { useTranslations } from '@/i18n/client';
import { useSettingsStore } from '@/stores/settings-store';
import { SettingsSection, SettingItem, Select, ToggleSwitch } from './settings-section';
import { TrustedSendersModal } from '@/components/trusted-senders-modal';
import { ChevronRight } from 'lucide-react';
import { usePolicyStore } from '@/stores/policy-store';
import { useContactStore } from '@/stores/contact-store';
import { useAuthStore } from '@/stores/auth-store';

export function ContentSendersSettings() {
  const t = useTranslations();
  const [showTrustedModal, setShowTrustedModal] = useState(false);
  const { isSettingLocked, isSettingHidden, isFeatureEnabled } = usePolicyStore();

  const {
    externalContentPolicy,
    emailAlwaysLightMode,
    trustedSenders,
    trustedSendersAddressBook,
    updateSetting,
  } = useSettingsStore();
  const { trustedSenderEmails, trustedSendersLoaded, loadTrustedSendersBook } = useContactStore();
  const client = useAuthStore((state) => state.client);

  // Load the address book so the count reflects the synced senders, not 0.
  useEffect(() => {
    if (trustedSendersAddressBook && client && !trustedSendersLoaded) {
      loadTrustedSendersBook(client);
    }
  }, [trustedSendersAddressBook, client, trustedSendersLoaded, loadTrustedSendersBook]);

  const getTrustedSendersCount = () => {
    const count = trustedSendersAddressBook ? trustedSenderEmails.length : trustedSenders.length;
    if (count === 0) return t("None");
    if (count === 1) return t("1 sender");
    return t("{count} senders", { count });
  };

  return (
    <SettingsSection title={t("Email Behavior")} description={t("Configure how emails are handled")}>
      {isFeatureEnabled('externalContentEnabled') && !isSettingHidden('externalContentPolicy') && (
      <SettingItem label={t("External Content")} description={t("How to handle images and external content")} locked={isSettingLocked('externalContentPolicy')} htmlFor="external-content-policy-select">
        <Select
          id="external-content-policy-select"
          value={externalContentPolicy}
          onChange={(value) =>
            updateSetting('externalContentPolicy', value as 'ask' | 'block' | 'allow')
          }
          options={[
            { value: 'ask', label: t("Always ask") },
            { value: 'block', label: t("Always block") },
            { value: 'allow', label: t("Always allow") },
          ]}
        />
      </SettingItem>
      )}

      <SettingItem label={t("Always Show Emails in Light Mode")} description={t("Render email content in light mode even when the app is in dark mode, avoiding dark mode conversion issues")} htmlFor="email-always-light-mode-toggle">
        <ToggleSwitch
          id="email-always-light-mode-toggle"
          checked={emailAlwaysLightMode}
          onChange={(checked) => updateSetting('emailAlwaysLightMode', checked)}
        />
      </SettingItem>

      <SettingItem label={t("Trusted Senders")} description={t("Manage senders whose images load automatically")}>
        <button
          onClick={() => setShowTrustedModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent rounded-md transition-colors"
        >
          <span className="text-sm text-foreground">{getTrustedSendersCount()}</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </SettingItem>

      <SettingItem label={t("Sync with address book")} description={t("Store trusted senders in a dedicated \"Trusted Senders\" address book so they sync across all your devices")} htmlFor="trusted-senders-use-address-book-toggle">
        <ToggleSwitch
          id="trusted-senders-use-address-book-toggle"
          checked={!!trustedSendersAddressBook}
          onChange={(checked) => updateSetting('trustedSendersAddressBook', checked)}
        />
      </SettingItem>

      <TrustedSendersModal
        isOpen={showTrustedModal}
        onClose={() => setShowTrustedModal(false)}
      />
    </SettingsSection>
  );
}
