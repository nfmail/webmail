'use client';

import { useState } from 'react';
import { useTranslations } from '@/i18n/client';
import { Button } from '@/components/ui/button';
import { SettingsSection, SettingItem } from './settings-section';
import { IdentityManagerModal } from '@/components/identity/identity-manager-modal';
import { useIdentityStore } from '@/stores/identity-store';

export function IdentitySettings() {
  const t = useTranslations();
  const { identities } = useIdentityStore();
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <SettingsSection title={t("Sending Identities")} description={t("Manage email addresses you can send from")}>
        {/* Identity Count */}
        <SettingItem
          label={t("Your Identities")}
          description={t("Email addresses configured for sending")}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">
              {identities.length === 0
                ? t("No identities")
                : identities.length === 1
                ? t("1 identity")
                : t("{count} identities", { count: identities.length })}
            </span>
            <Button onClick={() => setShowModal(true)} size="sm">
              {t("Manage Identities")}
            </Button>
          </div>
        </SettingItem>

        {/* Sub-Addressing Info */}
        <SettingItem
          label={t("Sub-Addressing")}
          description={t("Use tags like user+tag@domain.com to organize incoming mail")}
        >
          <Button variant="outline" size="sm" onClick={() => setShowModal(true)}>
            {t("Learn More")}
          </Button>
        </SettingItem>
      </SettingsSection>

      {/* Identity Manager Modal */}
      <IdentityManagerModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
