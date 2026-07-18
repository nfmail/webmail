"use client";

import { useTranslations } from '@/i18n/client';
import { useThemeStore } from '@/stores/theme-store';
import { useSettingsStore, type Density } from '@/stores/settings-store';
import { SettingsSection, SettingItem, RadioGroup, ToggleSwitch } from './settings-section';
import { cn } from '@/lib/utils';
import { useTour } from '@/components/tour/tour-provider';
import { Button } from '@/components/ui/button';
import { PlayCircle } from 'lucide-react';
import { usePolicyStore } from '@/stores/policy-store';

const DENSITY_PREVIEW: Record<Density, { py: string; gap: string; showAvatar: boolean; showPreview: boolean }> = {
  'extra-compact': { py: 'py-0.5', gap: 'gap-1.5', showAvatar: false, showPreview: false },
  compact:         { py: 'py-1',   gap: 'gap-2',   showAvatar: true,  showPreview: false },
  regular:         { py: 'py-2.5', gap: 'gap-3',   showAvatar: true,  showPreview: true },
  comfortable:     { py: 'py-4',   gap: 'gap-4',   showAvatar: true,  showPreview: true },
};

function DensityPreview({ density }: { density: Density }) {
  const cfg = DENSITY_PREVIEW[density];
  const rows = [
    { unread: true,  sender: 'Alice Johnson',  subject: 'Project update - Q1 roadmap', preview: 'Here are the latest numbers from…' },
    { unread: false, sender: 'Bob Smith',       subject: 'Re: Meeting notes',           preview: 'Thanks, will review and get back...' },
    { unread: true,  sender: 'Carol Lee',       subject: 'Invoice #4092',               preview: 'Please find attached the invoice…' },
  ];

  return (
    <div className="mt-3 rounded-lg border border-border overflow-hidden bg-background text-xs select-none">
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center px-3 border-b border-border last:border-b-0",
            cfg.py,
            cfg.gap
          )}
        >
          {cfg.showAvatar && (
            <div className={cn(
              "flex-shrink-0 rounded-full bg-muted",
              density === 'comfortable' ? "w-8 h-8" : "w-6 h-6"
            )} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("truncate", row.unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {row.sender}
              </span>
              <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">12:00</span>
            </div>
            <div className={cn("truncate", row.unread ? "font-medium text-foreground" : "text-foreground")}>
              {row.subject}
            </div>
            {cfg.showPreview && (
              <div className="truncate text-muted-foreground">{row.preview}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AppearanceSettings() {
  const t = useTranslations();
  const tAdvanced = useTranslations();
  const tTour = useTranslations();
  const { theme, setTheme } = useThemeStore();
  const { fontSize, density, animationsEnabled, senderFavicons, showAvatarsInJunk, showOnboardingOnNewDevices, updateSetting } = useSettingsStore();
  const { startTour, resetTourCompletion } = useTour();
  const { isSettingLocked, isSettingHidden } = usePolicyStore();

  return (
    <SettingsSection title={t("Appearance")} description={t("Customize the look and feel of your webmail")}>
      <SettingItem label={t("Theme")} description={t("Choose your preferred color scheme")}>
        <RadioGroup
          value={theme}
          onChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}
          options={[
            { value: 'light', label: t("Light") },
            { value: 'dark', label: t("Dark") },
            { value: 'system', label: t("System") },
          ]}
        />
      </SettingItem>

      {!isSettingHidden('fontSize') && (
      <SettingItem label={t("Font Size")} description={t("Adjust text size for better readability")} locked={isSettingLocked('fontSize')}>
        <RadioGroup
          value={fontSize}
          onChange={(value) => updateSetting('fontSize', value as 'small' | 'medium' | 'large')}
          options={[
            { value: 'small', label: t("Small") },
            { value: 'medium', label: t("Medium") },
            { value: 'large', label: t("Large") },
          ]}
        />
      </SettingItem>
      )}

      {!isSettingHidden('density') && (
      <SettingItem label={t("Density")} description={t("Control spacing and padding across the UI")} locked={isSettingLocked('density')}>
        <RadioGroup
          value={density}
          onChange={(value) =>
            updateSetting('density', value as Density)
          }
          options={[
            { value: 'extra-compact', label: t("Extra Compact") },
            { value: 'compact', label: t("Compact") },
            { value: 'regular', label: t("Regular") },
            { value: 'comfortable', label: t("Comfortable") },
          ]}
        />
        <DensityPreview density={density} />
      </SettingItem>
      )}

      {!isSettingHidden('animationsEnabled') && (
      <SettingItem label={t("Enable Animations")} description={t("Show smooth transitions and effects")} locked={isSettingLocked('animationsEnabled')} htmlFor="animations-enabled-toggle">
        <ToggleSwitch
          id="animations-enabled-toggle"
          checked={animationsEnabled}
          onChange={(checked) => updateSetting('animationsEnabled', checked)}
        />
      </SettingItem>
      )}

      <SettingItem label={tAdvanced("Sender Favicons")} description={tAdvanced("Show website icons as profile pictures for business senders")} htmlFor="sender-favicons-toggle">
        <ToggleSwitch id="sender-favicons-toggle" checked={senderFavicons} onChange={(checked) => updateSetting('senderFavicons', checked)} />
      </SettingItem>

      <SettingItem label={tAdvanced("Show Avatars in Junk Folder")} description={tAdvanced("Show profile images and favicons for senders in the junk folder. Disabled by default to avoid lending visual legitimacy to phishing attempts.")} htmlFor="show-avatars-in-junk-toggle">
        <ToggleSwitch id="show-avatars-in-junk-toggle" checked={showAvatarsInJunk} onChange={(checked) => updateSetting('showAvatarsInJunk', checked)} />
      </SettingItem>

      <SettingItem label={tTour("Introductory tour")} description={tTour("Replay the guided walkthrough of the interface")}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { resetTourCompletion(); startTour(); }}
          className="text-xs h-7"
        >
          <PlayCircle className="w-3.5 h-3.5 me-1" />
          {tTour("Restart tour")}
        </Button>
      </SettingItem>

      <SettingItem label={tTour("Show on new devices")} description={tTour("Replay the welcome banner and tour the first time you sign in on a new device, even if you've already completed them elsewhere")} htmlFor="show-onboarding-new-devices-toggle">
        <ToggleSwitch
          id="show-onboarding-new-devices-toggle"
          checked={showOnboardingOnNewDevices}
          onChange={(checked) => updateSetting('showOnboardingOnNewDevices', checked)}
        />
      </SettingItem>
    </SettingsSection>
  );
}
