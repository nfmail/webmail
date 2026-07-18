'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from '@/i18n/client';
import { SettingsSection, SettingItem, ToggleSwitch } from './settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { useVacationStore } from '@/stores/vacation-store';
import { useAuthStore } from '@/stores/auth-store';
import { useManagedAccountStore } from '@/stores/managed-account-store';
import { Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { toast } from '@/stores/toast-store';

function utcToLocalDatetime(utcIso: string): string {
  const d = new Date(utcIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function VacationSettings() {
  const t = useTranslations();
  const tNotifications = useTranslations();
  const { client } = useAuthStore();
  const managedAccountId = useManagedAccountStore((s) => s.managedAccountId);
  const {
    isEnabled,
    fromDate,
    toDate,
    subject,
    textBody,
    isLoading,
    isSaving,
    error,
    isSupported,
    fetchVacationResponse,
    updateVacationResponse,
  } = useVacationStore();

  const [localEnabled, setLocalEnabled] = useState(isEnabled);
  const [localFromDate, setLocalFromDate] = useState(fromDate || '');
  const [localToDate, setLocalToDate] = useState(toDate || '');
  const [localSubject, setLocalSubject] = useState(subject);
  const [localTextBody, setLocalTextBody] = useState(textBody);
  const [showPreview, setShowPreview] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (client && isSupported) {
      void fetchVacationResponse(client, managedAccountId ?? undefined);
    }
  }, [client, isSupported, managedAccountId, fetchVacationResponse]);

  useEffect(() => {
    setLocalEnabled(isEnabled);
    setLocalFromDate(fromDate || '');
    setLocalToDate(toDate || '');
    setLocalSubject(subject);
    setLocalTextBody(textBody);
  }, [isEnabled, fromDate, toDate, subject, textBody]);

  const validate = useCallback(() => {
    const warnings: string[] = [];

    if (localFromDate && localToDate && new Date(localToDate) <= new Date(localFromDate)) {
      warnings.push(t("End date must be after start date"));
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (localFromDate && new Date(localFromDate) < todayStart) {
      warnings.push(t("Start date is in the past"));
    }

    if (localEnabled && !localTextBody.trim()) {
      warnings.push(t("Message body is empty - recipients will receive a blank reply"));
    }

    setValidationWarnings(warnings);
    return warnings;
  }, [localFromDate, localToDate, localEnabled, localTextBody, t]);

  useEffect(() => {
    validate();
  }, [validate]);

  const hasChanges =
    localEnabled !== isEnabled ||
    (localFromDate || null) !== (fromDate || null) ||
    (localToDate || null) !== (toDate || null) ||
    localSubject !== subject ||
    localTextBody !== textBody;

  const hasBlockingError = !!(localFromDate && localToDate && new Date(localToDate) <= new Date(localFromDate));

  const handleSave = async () => {
    if (!client) return;
    validate();
    if (hasBlockingError) return;

    try {
      await updateVacationResponse(client, {
        isEnabled: localEnabled,
        fromDate: localFromDate || null,
        toDate: localToDate || null,
        subject: localSubject,
        textBody: localTextBody,
      }, managedAccountId ?? undefined);

      toast.success(tNotifications("Vacation responder settings saved"));
    } catch (error) {
      console.error('Failed to save vacation response:', error);
      toast.error(tNotifications("Failed to save vacation responder settings"));
    }
  };

  if (!isSupported) {
    return (
      <SettingsSection title={t("Vacation Responder")} description={t("Automatically reply to incoming emails while you're away")}>
        <div className="text-sm text-muted-foreground py-4">
          {t("Your mail server does not support vacation responses.")}
        </div>
      </SettingsSection>
    );
  }

  if (isLoading) {
    return (
      <SettingsSection title={t("Vacation Responder")} description={t("Automatically reply to incoming emails while you're away")}>
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("Loading vacation settings...")}
        </div>
      </SettingsSection>
    );
  }

  if (error) {
    return (
      <SettingsSection title={t("Vacation Responder")} description={t("Automatically reply to incoming emails while you're away")}>
        <div className="text-sm text-destructive py-4">
          {t("Failed to load vacation settings. Please try again.")}
        </div>
      </SettingsSection>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection title={t("Vacation Responder")} description={t("Automatically reply to incoming emails while you're away")}>
        <SettingItem
          label={t("Vacation Responder")}
          description={t("Send an automatic reply to people who email you")}
          htmlFor="vacation-enabled"
        >
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              localEnabled
                ? 'bg-success/10 text-success'
                : 'bg-muted text-muted-foreground'
            }`}>
              {localEnabled ? t("Active") : t("Inactive")}
            </span>
            <ToggleSwitch id="vacation-enabled" checked={localEnabled} onChange={setLocalEnabled} />
          </div>
        </SettingItem>
      </SettingsSection>

      <SettingsSection title={t("Date Range")} description={t("Optionally limit the auto-reply to a specific period")}>
        <SettingItem
          label={t("Start Date")}
          description={t("Leave empty for no start limit")}
          htmlFor="vacation-from-date"
        >
          <Input
            id="vacation-from-date"
            type="datetime-local"
            value={localFromDate ? utcToLocalDatetime(localFromDate) : ''}
            onChange={(e) => setLocalFromDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
            className="w-auto"
          />
        </SettingItem>
        <SettingItem
          label={t("End Date")}
          description={t("Leave empty for no end limit")}
          htmlFor="vacation-to-date"
        >
          <Input
            id="vacation-to-date"
            type="datetime-local"
            value={localToDate ? utcToLocalDatetime(localToDate) : ''}
            onChange={(e) => setLocalToDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
            className="w-auto"
          />
        </SettingItem>
      </SettingsSection>

      <SettingsSection title={t("Auto-Reply Message")} description={t("The message that will be sent as a reply")}>
        <SettingItem
          label={t("Subject")}
          description={t("Subject line of the auto-reply")}
          htmlFor="vacation-subject"
        >
          <Input
            id="vacation-subject"
            type="text"
            value={localSubject}
            onChange={(e) => setLocalSubject(e.target.value)}
            placeholder={t("Out of Office")}
            className="w-64"
          />
        </SettingItem>
        <div className="py-3">
          <Field>
            <FieldLabel htmlFor="vacation-body">{t("Message Body")}</FieldLabel>
            <FieldDescription>{t("Plain text message content")}</FieldDescription>
            <Textarea
              id="vacation-body"
              value={localTextBody}
              onChange={(e) => setLocalTextBody(e.target.value)}
              placeholder={t("Thank you for your email. I am currently out of the office and will respond when I return.")}
              rows={6}
              className="resize-y"
            />
          </Field>
        </div>
      </SettingsSection>

      {localTextBody.trim() && (
        <SettingsSection title={t("Preview")}>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPreview ? t("Hide preview") : t("Show preview")}
          </button>
          {showPreview && (
            <div className="mt-3 p-4 rounded border border-border bg-background">
              {localSubject && (
                <p className="font-medium text-foreground mb-2">{localSubject}</p>
              )}
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{localTextBody}</p>
            </div>
          )}
        </SettingsSection>
      )}

      {validationWarnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {validationWarnings.map((warning, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-warning">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving || !hasChanges || hasBlockingError}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
              {t("Saving...")}
            </>
          ) : (
            t("Save Changes")
          )}
        </Button>
      </div>
    </div>
  );
}
