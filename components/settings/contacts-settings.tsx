"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "@/i18n/client";
import { Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsSection, SettingItem, ToggleSwitch } from "./settings-section";
import { ContactImportDialog } from "@/components/contacts/contact-import-dialog";
import { exportContacts } from "@/components/contacts/contact-export";
import { useContactStore } from "@/stores/contact-store";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import { toast } from "@/stores/toast-store";

export function ContactsSettings() {
  const t = useTranslations();
  const tSettings = useTranslations();
  const { client } = useAuthStore();
  const {
    contacts,
    supportsSync,
    importContacts,
  } = useContactStore();
  const groupContactsByLetter = useSettingsStore((s) => s.groupContactsByLetter);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const [showImport, setShowImport] = useState(false);

  const individuals = contacts.filter(c => c.kind !== "group");

  const handleImport = useCallback(async (importedContacts: import("@/lib/jmap/types").ContactCard[]) => {
    return importContacts(
      supportsSync && client ? client : null,
      importedContacts
    );
  }, [supportsSync, client, importContacts]);

  const handleExport = () => {
    if (individuals.length > 0) {
      exportContacts(individuals);
      toast.success(t("{count, plural, one {1 contact exported} other {# contacts exported}}", { count: individuals.length }));
    }
  };

  if (showImport) {
    return (
      <div className="border border-border rounded-lg overflow-hidden" style={{ minHeight: 400 }}>
        <ContactImportDialog
          existingContacts={contacts}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      </div>
    );
  }

  return (
    <SettingsSection
      title={tSettings("Contacts")}
      description={tSettings("Import and export your contacts")}
    >
      <SettingItem
        label={tSettings("Group by first letter")}
        description={tSettings("Show alphabetical section headers in the contact list")}
        htmlFor="contacts-group-by-letter-toggle"
      >
        <ToggleSwitch
          id="contacts-group-by-letter-toggle"
          checked={groupContactsByLetter}
          onChange={(checked) => updateSetting("groupContactsByLetter", checked)}
        />
      </SettingItem>

      <SettingItem
        label={tSettings("Import Contacts")}
        description={tSettings("Import contacts from a vCard (.vcf) file")}
      >
        <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
          <Upload className="w-4 h-4 me-2" />
          {t("Import Contacts")}
        </Button>
      </SettingItem>

      <SettingItem
        label={tSettings("Export Contacts")}
        description={tSettings("Export all contacts as a vCard (.vcf) file")}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={individuals.length === 0}
        >
          <Download className="w-4 h-4 me-2" />
          {t("Export Contacts")}
        </Button>
      </SettingItem>
    </SettingsSection>
  );
}
