"use client";

import { useEffect, useState } from 'react';
import { useTranslations } from '@/i18n/client';
import { useSettingsStore } from '@/stores/settings-store';
import { SettingsSection, SettingItem, ToggleSwitch, Select } from './settings-section';
import { playNotificationSound, NOTIFICATION_SOUNDS } from '@/lib/notification-sound';
import type { NotificationSoundChoice } from '@/lib/notification-sound';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { CheckCircle2, Lock, Volume2, XCircle } from 'lucide-react';
import { usePolicyStore } from '@/stores/policy-store';
import { useAuthStore } from '@/stores/auth-store';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDialog } from '@/hooks/use-confirm-dialog';
import {
  DEFAULT_RELAY_BASE_URL,
  WebPushUnsupportedError,
  disableWebPush,
  enableWebPush,
  isWebPushEnabled,
  isWebPushSupported,
} from '@/lib/web-push';

type PushStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'enabled' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

export function NotificationSettings() {
  const t = useTranslations();
  const {
    emailNotificationsEnabled,
    emailNotificationSound,
    notificationSoundChoice,
    calendarNotificationsEnabled,
    calendarNotificationSound,
    calendarInvitationParsingEnabled,
    updateSetting,
  } = useSettingsStore();
  const { isSettingLocked, isSettingHidden } = usePolicyStore();
  const adminPushRelayUrl = usePolicyStore((s) => s.policy.pushRelayUrl);
  const pushRelayLocked = usePolicyStore((s) => s.policy.pushRelayUrlLocked) === true;
  const client = useAuthStore((s) => s.client);
  const username = useAuthStore((s) => s.username);
  const { dialogProps: confirmDialogProps, confirm: confirmDialog } = useConfirmDialog();

  const supported = typeof window !== 'undefined' && isWebPushSupported();
  const adminUrl = (adminPushRelayUrl ?? '').trim();
  const [relayUrl, setRelayUrl] = useState(adminUrl || DEFAULT_RELAY_BASE_URL);
  const [pushStatus, setPushStatus] = useState<PushStatus>(
    supported ? { kind: 'idle' } : { kind: 'unsupported' },
  );

  // Pull the admin-configured URL into local state when policy loads/changes.
  // When locked, the admin value always wins; when only set (not locked), use
  // it as the initial default but let the user override.
  useEffect(() => {
    if (pushRelayLocked && adminUrl) {
      setRelayUrl(adminUrl);
    } else if (adminUrl) {
      setRelayUrl((current) => (current === DEFAULT_RELAY_BASE_URL ? adminUrl : current));
    }
  }, [adminUrl, pushRelayLocked]);

  useEffect(() => {
    if (!supported) return;
    if (!client) return;
    const accountId = client.getAccountId();
    if (!accountId) return;
    void (async () => {
      const enabled = await isWebPushEnabled(accountId);
      setPushStatus(enabled ? { kind: 'enabled' } : { kind: 'idle' });
    })();
  }, [supported, client]);

  const trimmedRelay = relayUrl.trim().replace(/\/+$/, '');
  const isValidRelay = /^https?:\/\/.+/i.test(trimmedRelay);
  const busy = pushStatus.kind === 'busy';

  const handleEnablePush = async () => {
    if (!client) {
      setPushStatus({ kind: 'error', message: 'Sign in first' });
      return;
    }
    if (!isValidRelay) {
      setPushStatus({ kind: 'error', message: 'Enter a valid https:// URL' });
      return;
    }
    setPushStatus({ kind: 'busy' });
    try {
      await enableWebPush({
        client,
        relayBaseUrl: trimmedRelay,
        accountLabel: username ?? undefined,
      });
      setPushStatus({ kind: 'enabled' });
    } catch (err) {
      if (err instanceof WebPushUnsupportedError) {
        setPushStatus({ kind: 'unsupported' });
        return;
      }
      setPushStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to enable push',
      });
    }
  };

  const handleDisablePush = async () => {
    if (!client) return;
    const confirmed = await confirmDialog({
      title: t("Disable background notifications?"),
      message: t("This device will stop receiving alerts when the site is closed."),
      confirmText: t("Disable"),
      variant: 'destructive',
    });
    if (!confirmed) return;
    setPushStatus({ kind: 'busy' });
    try {
      await disableWebPush({ client, relayBaseUrl: trimmedRelay });
      setPushStatus({ kind: 'idle' });
    } catch (err) {
      setPushStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to disable push',
      });
    }
  };

  const soundOptions = NOTIFICATION_SOUNDS.map((s) => ({
    value: s.id,
    label: t(`sounds.${s.id}`),
  }));

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title={t("Background Notifications")} description={t("Receive system notifications for new mail when this site is closed. Delivered via the Bulwark push relay; the relay never sees mail content.")}>
        <div className="rounded-md border border-border bg-card p-4">
          <FieldGroup>
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="push-relay-url">
                  {t("Push relay")}
                  {pushRelayLocked && (
                    <Lock className="w-3 h-3 text-muted-foreground" aria-label={t("Set by administrator")} />
                  )}
                </FieldLabel>
                <PushStatusBadge status={pushStatus} t={t} />
              </div>
              <FieldDescription>
                {pushRelayLocked ? t("The push relay URL has been set by your administrator and cannot be changed.") : t("Defaults to the hosted Bulwark relay. Change only if you self-host.")}
              </FieldDescription>
              <Input
                id="push-relay-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                placeholder={t("https://notifications.relay.example.com")}
                disabled={busy || pushStatus.kind === 'unsupported' || pushRelayLocked}
                readOnly={pushRelayLocked}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleEnablePush}
                  disabled={busy || pushStatus.kind === 'unsupported' || !isValidRelay || !client}
                >
                  {pushStatus.kind === 'enabled' ? t("Re-register") : t("Enable")}
                </Button>
                {pushStatus.kind === 'enabled' && (
                  <Button variant="outline" onClick={handleDisablePush} disabled={busy}>
                    {t("Disable")}
                  </Button>
                )}
              </div>
              {pushStatus.kind === 'unsupported' && (
                <FieldDescription>{t("On iOS, install the site to your home screen first - Safari only delivers Web Push to installed PWAs.")}</FieldDescription>
              )}
            </Field>
          </FieldGroup>
        </div>
      </SettingsSection>

      <SettingsSection title={t("Notification Sound")} description={t("Choose which sound to play for notifications")}>
        <SettingItem
          label={t("Sound")}
          description={t("Select a notification tone and click the speaker icon to preview it")}
          htmlFor="notification-sound-select"
        >
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => playNotificationSound(notificationSoundChoice)}
              title={t("Test notification sound")}
            >
              <Volume2 className="w-4 h-4" />
            </Button>
            <Select
              id="notification-sound-select"
              value={notificationSoundChoice}
              onChange={(value) => {
                const choice = value as NotificationSoundChoice;
                updateSetting('notificationSoundChoice', choice);
                playNotificationSound(choice);
              }}
              options={soundOptions}
            />
          </div>
        </SettingItem>
      </SettingsSection>

      <SettingsSection title={t("Email Notifications")} description={t("Configure notifications for incoming emails")}>
        {!isSettingHidden('emailNotificationsEnabled') && (
        <SettingItem
          label={t("Email notifications")}
          description={t("Show notifications when new emails arrive")}
          locked={isSettingLocked('emailNotificationsEnabled')}
          htmlFor="email-notifications-enabled"
        >
          <ToggleSwitch
            id="email-notifications-enabled"
            checked={emailNotificationsEnabled}
            onChange={(checked) => updateSetting('emailNotificationsEnabled', checked)}
          />
        </SettingItem>
        )}

        <SettingItem
          label={t("Notification sound")}
          description={t("Play an audio alert when new emails arrive")}
          htmlFor="email-notification-sound"
        >
          <ToggleSwitch
            id="email-notification-sound"
            checked={emailNotificationSound}
            onChange={(checked) => updateSetting('emailNotificationSound', checked)}
            disabled={!emailNotificationsEnabled}
          />
        </SettingItem>
      </SettingsSection>

      <SettingsSection title={t("Calendar Notifications")} description={t("Configure notifications for calendar events")}>
        {!isSettingHidden('calendarNotificationsEnabled') && (
        <SettingItem
          label={t("Event notifications")}
          description={t("Show alerts for upcoming calendar events")}
          locked={isSettingLocked('calendarNotificationsEnabled')}
          htmlFor="calendar-notifications-enabled"
        >
          <ToggleSwitch
            id="calendar-notifications-enabled"
            checked={calendarNotificationsEnabled}
            onChange={(checked) => updateSetting('calendarNotificationsEnabled', checked)}
          />
        </SettingItem>
        )}

        <SettingItem
          label={t("Notification sound")}
          description={t("Play an audio alert for calendar reminders")}
          htmlFor="calendar-notification-sound"
        >
          <ToggleSwitch
            id="calendar-notification-sound"
            checked={calendarNotificationSound}
            onChange={(checked) => updateSetting('calendarNotificationSound', checked)}
            disabled={!calendarNotificationsEnabled}
          />
        </SettingItem>

        <SettingItem
          label={t("Parse email invitations")}
          description={t("Detect calendar invitations in email attachments and show calendar actions")}
          htmlFor="calendar-invitation-parsing"
        >
          <ToggleSwitch
            id="calendar-invitation-parsing"
            checked={calendarInvitationParsingEnabled}
            onChange={(checked) => updateSetting('calendarInvitationParsingEnabled', checked)}
          />
        </SettingItem>
      </SettingsSection>

      <ConfirmDialog {...confirmDialogProps} />
    </div>
  );
}

function PushStatusBadge({
  status,
  t,
}: {
  status: PushStatus;
  t: ReturnType<typeof useTranslations>;
}) {
  if (status.kind === 'enabled') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {t("Active on this device")}
      </span>
    );
  }
  if (status.kind === 'busy') {
    return <span className="text-xs text-muted-foreground">{t("Working…")}</span>;
  }
  if (status.kind === 'unsupported') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <XCircle className="w-3.5 h-3.5" />
        {t("This browser does not support Web Push")}
      </span>
    );
  }
  if (status.kind === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive" title={status.message}>
        <XCircle className="w-3.5 h-3.5" />
        {status.message}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{t("Not enabled on this device")}</span>;
}
