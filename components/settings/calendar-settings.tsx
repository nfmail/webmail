"use client";

import { useTranslations } from '@/i18n/client';
import { useCalendarStore, CalendarViewMode } from '@/stores/calendar-store';
import { useSettingsStore } from '@/stores/settings-store';
import { usePolicyStore } from '@/stores/policy-store';
import { SettingsSection, SettingItem, Select, ToggleSwitch } from './settings-section';

export function CalendarSettings() {
  const t = useTranslations();
  const tViews = useTranslations();

  const { viewMode, setViewMode } = useCalendarStore();
  const {
    showTimeInMonthView,
    showWeekNumbers,
    enableCalendarTasks,
    showTasksOnCalendar,
    showBirthdayCalendar,
    calendarHoverPreview,
    updateSetting,
  } = useSettingsStore();
  const { isFeatureEnabled } = usePolicyStore();

  return (
    <SettingsSection title={t("Calendar settings")}>
      <SettingItem label={t("Default view")} htmlFor="calendar-default-view-select">
        <Select
          id="calendar-default-view-select"
          value={viewMode}
          onChange={(value) => setViewMode(value as CalendarViewMode)}
          options={[
            { value: 'month', label: tViews("Month") },
            { value: 'week', label: tViews("Week") },
            { value: 'day', label: tViews("Day") },
            { value: 'agenda', label: tViews("Agenda") },
          ]}
        />
      </SettingItem>

      <SettingItem
        label={t("Show time in month view")}
        description={t("Display event times in the month calendar view")}
        htmlFor="calendar-show-time-in-month-view-toggle"
      >
        <ToggleSwitch
          id="calendar-show-time-in-month-view-toggle"
          checked={showTimeInMonthView}
          onChange={(checked) => updateSetting('showTimeInMonthView', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t("Show week numbers")}
        description={t("Display week numbers in the mini-calendar")}
        htmlFor="calendar-show-week-numbers-toggle"
      >
        <ToggleSwitch
          id="calendar-show-week-numbers-toggle"
          checked={showWeekNumbers}
          onChange={(checked) => updateSetting('showWeekNumbers', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t("Event hover preview")}
        description={t("Show a detail popover when hovering over calendar events")}
        htmlFor="calendar-hover-preview-select"
      >
        <Select
          id="calendar-hover-preview-select"
          value={calendarHoverPreview}
          onChange={(value) => updateSetting('calendarHoverPreview', value as 'off' | 'instant' | 'delay-500ms' | 'delay-1s' | 'delay-2s')}
          options={[
            { value: 'instant', label: t("Instant") },
            { value: 'delay-500ms', label: t("0.5-second delay") },
            { value: 'delay-1s', label: t("1-second delay") },
            { value: 'delay-2s', label: t("2-second delay") },
            { value: 'off', label: t("Disabled") },
          ]}
        />
      </SettingItem>

      <SettingItem
        label={t("Contact birthday calendar")}
        description={t("Show a virtual calendar with birthdays from your contacts")}
        htmlFor="calendar-show-birthday-calendar-toggle"
      >
        <ToggleSwitch
          id="calendar-show-birthday-calendar-toggle"
          checked={showBirthdayCalendar}
          onChange={(checked) => updateSetting('showBirthdayCalendar', checked)}
        />
      </SettingItem>

      {isFeatureEnabled('calendarTasksEnabled') && (
      <>
      <SettingItem
        label={t("Enable tasks")}
        description={t("Show a tasks view in the calendar for managing to-dos")}
        htmlFor="calendar-enable-tasks-toggle"
      >
        <ToggleSwitch
          id="calendar-enable-tasks-toggle"
          checked={enableCalendarTasks}
          onChange={(checked) => updateSetting('enableCalendarTasks', checked)}
        />
      </SettingItem>

      {enableCalendarTasks && (
        <SettingItem
          label={t("Show tasks on calendar")}
          description={t("Display task chips on the day and week calendar views")}
          htmlFor="calendar-show-tasks-on-calendar-toggle"
        >
          <ToggleSwitch
            id="calendar-show-tasks-on-calendar-toggle"
            checked={showTasksOnCalendar}
            onChange={(checked) => updateSetting('showTasksOnCalendar', checked)}
          />
        </SettingItem>
      )}
      </>
      )}

    </SettingsSection>
  );
}
