"use client";

import { useTranslations } from '@/i18n/client';
import { useSettingsStore, ALL_DEBUG_CATEGORIES } from '@/stores/settings-store';
import { SettingsSection, SettingItem, ToggleSwitch } from './settings-section';
import { usePolicyStore } from '@/stores/policy-store';

export function DebugSettings() {
  const t = useTranslations();
  const { debugMode, debugCategories, updateSetting } = useSettingsStore();
  const { isSettingLocked, isSettingHidden, isFeatureEnabled } = usePolicyStore();

  if (isSettingHidden('debugMode') || !isFeatureEnabled('debugModeEnabled')) {
    return (
      <SettingsSection title={t("Debug Mode")} description={t("Enable detailed logging for troubleshooting")}>
        <p className="text-sm text-muted-foreground py-2">{t("Enable detailed logging for troubleshooting")}</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title={t("Debug Mode")} description={t("Enable detailed logging for troubleshooting")}>
      <SettingItem label={t("Debug Mode")} description={t("Enable detailed logging for troubleshooting")} locked={isSettingLocked('debugMode')} htmlFor="debug-mode-toggle">
        <ToggleSwitch id="debug-mode-toggle" checked={debugMode} onChange={(checked) => updateSetting('debugMode', checked)} />
      </SettingItem>

      {debugMode && (
        <div className="ms-4 flex flex-col gap-1 border-s-2 border-muted ps-4">
          <p className="text-xs text-muted-foreground mb-2">{t("Select which categories to log. Disable categories you don't need to reduce console noise.")}</p>
          {ALL_DEBUG_CATEGORIES.map((cat) => (
            <SettingItem
              key={cat.id}
              label={t(`debug_categories.${cat.labelKey}`)}
              description={t(`debug_categories.${cat.labelKey}_description`)}
              htmlFor={`debug-category-${cat.id}-toggle`}
            >
              <ToggleSwitch
                id={`debug-category-${cat.id}-toggle`}
                checked={debugCategories?.[cat.id] !== false}
                onChange={(checked) => {
                  updateSetting('debugCategories', {
                    ...debugCategories,
                    [cat.id]: checked,
                  });
                }}
              />
            </SettingItem>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
