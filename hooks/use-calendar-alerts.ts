"use client";

import { useEffect, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from '@/i18n/client';
import { parseISO } from 'date-fns';
import { useAuthStore } from '@/stores/auth-store';
import { useCalendarStore } from '@/stores/calendar-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useTaskStore } from '@/stores/task-store';
import { useCalendarNotificationStore } from '@/stores/calendar-notification-store';
import { toast } from '@/stores/toast-store';
import { getPendingAlerts, getPendingTaskAlerts, buildAlertKey } from '@/lib/calendar-alerts';
import { playNotificationSound } from '@/lib/notification-sound';
import { getPathPrefix } from '@/lib/browser-navigation';
import type { CalendarEvent } from '@/lib/jmap/types';

const CHECK_INTERVAL_MS = 60 * 1000;
const PROACTIVE_FETCH_HOURS = 24;
const PROACTIVE_THROTTLE_MS = CHECK_INTERVAL_MS * 5;

export function useCalendarAlerts() {
  const { isAuthenticated, client } = useAuthStore();
  const { events, calendars, supportsCalendar } = useCalendarStore();
  const { calendarNotificationsEnabled, calendarNotificationSound, enableCalendarTasks, notificationSoundChoice } = useSettingsStore();
  const { tasks: storeTasks } = useTaskStore();
  const { acknowledgedAlerts, acknowledgeAlert, cleanupStaleAlerts } = useCalendarNotificationStore();
  const t = useTranslations();
  const tNotif = useTranslations();
  const locale = useLocale();

  const goToCalendar = useCallback(() => {
    window.location.href = `${getPathPrefix(locale)}/${locale}/calendar`;
  }, [locale]);

  const lastProactiveFetchRef = useRef<number>(0);
  const proactiveEventsRef = useRef<CalendarEvent[]>([]);
  const shownKeysRef = useRef<Set<string>>(new Set());

  const checkAlerts = useCallback(() => {
    if (!calendarNotificationsEnabled || !isAuthenticated) return;

    try {
      const now = Date.now();
      const acknowledgedKeys = new Set(Object.keys(acknowledgedAlerts));
      const allEvents = [...events, ...proactiveEventsRef.current];
      const pending = getPendingAlerts(allEvents, calendars, acknowledgedKeys, now);

      for (const alert of pending) {
        const key = buildAlertKey(alert.eventId, alert.alertId, alert.fireTimeMs);
        if (shownKeysRef.current.has(key)) continue;

        shownKeysRef.current.add(key);
        acknowledgeAlert(key, alert.fireTimeMs);

        if (calendarNotificationSound) {
          playNotificationSound(notificationSoundChoice);
        }

        const diffMs = (alert.event.utcStart ? new Date(alert.event.utcStart).getTime() : parseISO(alert.event.start).getTime()) - now;
        const diffMin = Math.round(diffMs / 60000);

        const timeLabel = diffMin <= 0
          ? t("Starting now")
          : t("In {count} min", { count: diffMin });

        const message = alert.calendarName
          ? `${timeLabel} · ${alert.calendarName}`
          : timeLabel;

        toast.info(alert.event.title || t("Upcoming event"), {
          message,
          duration: 15000,
          action: {
            label: tNotif("Click to view"),
            onClick: goToCalendar,
          },
        });
      }

      // Task alerts
      if (enableCalendarTasks && storeTasks.length > 0) {
        const pendingTaskAlerts = getPendingTaskAlerts(storeTasks, calendars, acknowledgedKeys, now);
        for (const taskAlert of pendingTaskAlerts) {
          const key = buildAlertKey(taskAlert.taskId, taskAlert.alertId, taskAlert.fireTimeMs);
          if (shownKeysRef.current.has(key)) continue;

          shownKeysRef.current.add(key);
          acknowledgeAlert(key, taskAlert.fireTimeMs);

          if (calendarNotificationSound) {
            playNotificationSound(notificationSoundChoice);
          }

          const taskMsg = taskAlert.calendarName
            ? `${t("Task due")} · ${taskAlert.calendarName}`
            : t("Task due");

          toast.info(taskAlert.task.title || t("Upcoming event"), {
            message: taskMsg,
            duration: 15000,
            action: {
              label: tNotif("Click to view"),
              onClick: goToCalendar,
            },
          });
        }
      }
    } catch {
      // Silently ignore alert evaluation errors
    }
  }, [
    calendarNotificationsEnabled, calendarNotificationSound, notificationSoundChoice,
    isAuthenticated, events, calendars, acknowledgedAlerts,
    acknowledgeAlert, t, tNotif, goToCalendar, enableCalendarTasks, storeTasks,
  ]);

  const proactiveFetch = useCallback(async () => {
    if (!client || !supportsCalendar || !calendarNotificationsEnabled || !isAuthenticated) return;

    const now = Date.now();
    if (now - lastProactiveFetchRef.current < PROACTIVE_THROTTLE_MS) return;

    try {
      const start = new Date(now - 10 * 60 * 1000).toISOString();
      const end = new Date(now + PROACTIVE_FETCH_HOURS * 60 * 60 * 1000).toISOString();
      const fetched = await client.queryCalendarEvents({ after: start, before: end });
      proactiveEventsRef.current = fetched;
      lastProactiveFetchRef.current = Date.now();
    } catch {
      // Silently ignore proactive fetch errors
    }
  }, [client, supportsCalendar, calendarNotificationsEnabled, isAuthenticated]);

  useEffect(() => {
    if (!calendarNotificationsEnabled || !isAuthenticated) return;

    cleanupStaleAlerts();
    proactiveFetch();

    const timer = setTimeout(() => checkAlerts(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, calendarNotificationsEnabled]);

  useEffect(() => {
    if (!calendarNotificationsEnabled || !isAuthenticated) return;

    const interval = setInterval(() => {
      proactiveFetch();
      checkAlerts();
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [calendarNotificationsEnabled, isAuthenticated, checkAlerts, proactiveFetch]);

  useEffect(() => {
    if (!calendarNotificationsEnabled || !isAuthenticated) return;
    checkAlerts();
  }, [events, calendarNotificationsEnabled, isAuthenticated, checkAlerts]);
}
