"use client";

import { useTranslations } from 'next-intl';
import { useCalendarStore, CalendarViewMode } from '@/stores/calendar-store';
import { useSettingsStore } from '@/stores/settings-store';
import { usePolicyStore } from '@/stores/policy-store';
import { SettingsSection, SettingItem, Select, ToggleSwitch } from './settings-section';

export function CalendarSettings() {
  const t = useTranslations('calendar.settings');
  const tViews = useTranslations('calendar.views');

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
    <SettingsSection title={t('title')}>
      <SettingItem label={t('default_view')} htmlFor="calendar-default-view-select">
        <Select
          id="calendar-default-view-select"
          value={viewMode}
          onChange={(value) => setViewMode(value as CalendarViewMode)}
          options={[
            { value: 'month', label: tViews('month') },
            { value: 'week', label: tViews('week') },
            { value: 'day', label: tViews('day') },
            { value: 'agenda', label: tViews('agenda') },
          ]}
        />
      </SettingItem>

      <SettingItem
        label={t('show_time_in_month_view')}
        description={t('show_time_in_month_view_desc')}
        htmlFor="calendar-show-time-in-month-view-toggle"
      >
        <ToggleSwitch
          id="calendar-show-time-in-month-view-toggle"
          checked={showTimeInMonthView}
          onChange={(checked) => updateSetting('showTimeInMonthView', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('show_week_numbers')}
        description={t('show_week_numbers_desc')}
        htmlFor="calendar-show-week-numbers-toggle"
      >
        <ToggleSwitch
          id="calendar-show-week-numbers-toggle"
          checked={showWeekNumbers}
          onChange={(checked) => updateSetting('showWeekNumbers', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('hover_preview')}
        description={t('hover_preview_desc')}
        htmlFor="calendar-hover-preview-select"
      >
        <Select
          id="calendar-hover-preview-select"
          value={calendarHoverPreview}
          onChange={(value) => updateSetting('calendarHoverPreview', value as 'off' | 'instant' | 'delay-500ms' | 'delay-1s' | 'delay-2s')}
          options={[
            { value: 'instant', label: t('hover_preview_instant') },
            { value: 'delay-500ms', label: t('hover_preview_delay_500ms') },
            { value: 'delay-1s', label: t('hover_preview_delay_1s') },
            { value: 'delay-2s', label: t('hover_preview_delay_2s') },
            { value: 'off', label: t('hover_preview_off') },
          ]}
        />
      </SettingItem>

      <SettingItem
        label={t('show_birthday_calendar')}
        description={t('show_birthday_calendar_desc')}
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
        label={t('enable_tasks')}
        description={t('enable_tasks_desc')}
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
          label={t('show_tasks_on_calendar')}
          description={t('show_tasks_on_calendar_desc')}
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
