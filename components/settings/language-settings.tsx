"use client";

import { useMemo } from 'react';
import { useTranslations } from '@/i18n/client';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { useLocaleStore } from '@/stores/locale-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { DateFormat, DateLocale, TimeFormat, FirstDayOfWeek } from '@/stores/settings-store';
import { formatDate } from '@/lib/utils';
import { SettingsSection, SettingItem, Select, RadioGroup } from './settings-section';

export function LanguageSettings() {
  const t = useTranslations();
  const tDays = useTranslations();

  const { dateFormat, dateLocale, timeFormat, firstDayOfWeek, updateSetting } = useSettingsStore();

  // Subscribe to locale changes so the preview re-renders on language switch
  // (formatDate reads it via getState() and would otherwise stay stale).
  const locale = useLocaleStore((s) => s.locale);

  const preview = useMemo(() => {
    // Build sample timestamps for each bucket so users see what their pick
    // will look like in practice. Use offsets relative to "now" so the
    // bucketing is stable even though the wall-clock keeps moving.
    void locale; void dateFormat; void dateLocale; void timeFormat;
    const now = new Date();
    const today = new Date(now);
    today.setHours(15, 31, 0, 0);
    const thisWeek = new Date(now);
    thisWeek.setDate(now.getDate() - 2);
    thisWeek.setHours(15, 31, 0, 0);
    const older = new Date(now);
    older.setMonth(now.getMonth() - 2);
    older.setHours(15, 31, 0, 0);
    return {
      today: formatDate(today),
      thisWeek: formatDate(thisWeek),
      older: formatDate(older),
    };
  }, [locale, dateFormat, dateLocale, timeFormat]);

  return (
    <SettingsSection title={t("Language, Region & Time")} description={t("Language, date format, time format, and other regional preferences")}>
      <SettingItem label={t("Language")} description={t("Choose your preferred language")}>
        <LanguageSwitcher />
      </SettingItem>

      <SettingItem label={t("Date Format")} description={t("How dates are shown in the email list")} htmlFor="date-format-select">
        <div className="flex flex-col items-end gap-2">
          <Select
            id="date-format-select"
            value={dateFormat}
            onChange={(value) => updateSetting('dateFormat', value as DateFormat)}
            options={[
              { value: 'smart', label: t("Smart (locale-aware)") },
              { value: 'relative', label: t("Relative (1h ago, 2d ago)") },
              { value: 'full', label: t("Always full date") },
            ]}
          />
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground text-end font-mono">
            <div>
              <span className="opacity-70">{t("Today:")} </span>
              <span className="text-foreground">{preview.today}</span>
            </div>
            <div>
              <span className="opacity-70">{t("This week:")} </span>
              <span className="text-foreground">{preview.thisWeek}</span>
            </div>
            <div>
              <span className="opacity-70">{t("Older:")} </span>
              <span className="text-foreground">{preview.older}</span>
            </div>
          </div>
        </div>
      </SettingItem>

      <SettingItem label={t("Date format region")} description={t("How numeric dates are ordered (day, month, year)")} htmlFor="date-locale-select">
        <Select
          id="date-locale-select"
          value={dateLocale}
          onChange={(value) => updateSetting('dateLocale', value as DateLocale)}
          options={[
            { value: 'auto', label: t("Automatic (match language)") },
            { value: 'iso', label: t("ISO 8601 (YYYY-MM-DD)") },
            { value: 'en-GB', label: t("Day/Month/Year") },
            { value: 'en-US', label: t("Month/Day/Year") },
          ]}
        />
      </SettingItem>

      <SettingItem label={t("Time Format")} description={t("Choose between 12-hour or 24-hour clock")}>
        <RadioGroup
          value={timeFormat}
          onChange={(value) => updateSetting('timeFormat', value as TimeFormat)}
          options={[
            { value: '12h', label: t("12-hour") },
            { value: '24h', label: t("24-hour") },
          ]}
        />
      </SettingItem>

      <SettingItem label={t("First Day of Week")} description={t("Start week on Sunday or Monday")} htmlFor="first-day-of-week-select">
        <Select
          id="first-day-of-week-select"
          value={firstDayOfWeek.toString()}
          onChange={(value) => updateSetting('firstDayOfWeek', parseInt(value) as FirstDayOfWeek)}
          options={[
            { value: '1', label: tDays("Monday") },
            { value: '6', label: tDays("Saturday") },
            { value: '0', label: tDays("Sunday") },
          ]}
        />
      </SettingItem>
    </SettingsSection>
  );
}
