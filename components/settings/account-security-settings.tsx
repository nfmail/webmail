'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from '@/i18n/client';
import QRCode from 'qrcode';
import * as OTPAuth from 'otpauth';
import { Shield, Key, Smartphone, Lock, Trash2, Plus, Eye, EyeOff, Copy, Check, Loader2, Monitor, Terminal, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { SettingsSection, SettingItem, ToggleSwitch } from './settings-section';
import { useAccountSecurityStore, type AppPasswordInfo, type ApiKeyInfo, type AppCredentialInput } from '@/stores/account-security-store';
import { useAuthStore } from '@/stores/auth-store';
import { useAccountStore } from '@/stores/account-store';
import { apiFetch, getPathPrefix } from '@/lib/browser-navigation';
import { toast } from '@/stores/toast-store';
import { cn } from '@/lib/utils';
import { sanitizeI18nHtml } from '@/lib/email-sanitization';

function PasswordChangeSection() {
  const t = useTranslations();
  const { changePassword, isSaving } = useAccountSecurityStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(t("Password must be at least 8 characters"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("New passwords do not match"));
      return;
    }

    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t("Password changed successfully"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("Failed to change password");
      setError(msg);
      toast.error(t("Password change failed"), msg);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-2">
        <Key className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-medium text-foreground">{t("Change Password")}</h4>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="security-current-password">{t("Current Password")}</FieldLabel>
              <div className="relative">
                <Input
                  id="security-current-password"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="security-new-password">{t("New Password")}</FieldLabel>
              <div className="relative">
                <Input
                  id="security-new-password"
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="security-confirm-password">{t("Confirm New Password")}</FieldLabel>
              <Input
                id="security-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'security-password-error' : undefined}
              />
              {error && (
                <FieldError id="security-password-error" aria-live="polite">
                  {error}
                </FieldError>
              )}
            </Field>
          </FieldGroup>
          <Button
            type="submit"
            size="sm"
            className="self-start"
            disabled={isSaving || !currentPassword || !newPassword || !confirmPassword}
          >
            {isSaving ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : null}
            {t("Change Password")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function DisplayNameSection() {
  const t = useTranslations();
  const { displayName, updateDisplayName, isSaving, isLoadingPrincipal } = useAccountSecurityStore();
  const [name, setName] = useState(displayName);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(displayName);
  }, [displayName]);

  const handleSave = async () => {
    try {
      await updateDisplayName(name);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success(t("Display name updated"));
    } catch (err) {
      toast.error(t("Failed to update display name"), err instanceof Error ? err.message : undefined);
    }
  };

  if (isLoadingPrincipal) {
    return (
      <SettingItem label={t("Display Name")} description={t("Your name as it appears on the server")}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </SettingItem>
    );
  }

  return (
    <SettingItem label={t("Display Name")} description={t("Your name as it appears on the server")} htmlFor="security-display-name">
      <div className="flex items-center gap-2">
        <Input
          id="security-display-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={displayName || t("Enter your display name")}
          className="w-48"
        />
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || name === displayName}
        >
          {saved ? <Check className="w-4 h-4" /> : isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Save")}
        </Button>
      </div>
    </SettingItem>
  );
}

function generateTotp(accountLabel: string): { totp: OTPAuth.TOTP; url: string } {
  const totp = new OTPAuth.TOTP({
    issuer: 'Stalwart',
    label: accountLabel || 'account',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });
  return { totp, url: totp.toString() };
}

function TotpSection() {
  const t = useTranslations();
  const { otpEnabled, enableTotp, disableTotp, isSaving, isLoadingAuth } = useAccountSecurityStore();
  const { client } = useAuthStore();

  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [setupTotp, setSetupTotp] = useState<OTPAuth.TOTP | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);

  useEffect(() => {
    if (!setupUrl) { setQrDataUrl(null); return; }
    let cancelled = false;
    QRCode.toDataURL(setupUrl, { width: 220, margin: 1 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [setupUrl]);

  const startSetup = () => {
    const { totp, url } = generateTotp(client?.getUsername() ?? 'account');
    setSetupTotp(totp);
    setSetupUrl(url);
    setPassword('');
    setOtpCode('');
    setSetupError(null);
  };

  const cancelSetup = () => {
    setSetupTotp(null);
    setSetupUrl(null);
    setPassword('');
    setOtpCode('');
    setSetupError(null);
  };

  const confirmSetup = async () => {
    if (!setupTotp || !setupUrl) return;
    if (!password) { setSetupError(t("Password is required")); return; }
    if (!otpCode.trim()) { setSetupError(t("Verification code is required")); return; }
    if (setupTotp.validate({ token: otpCode.trim(), window: 1 }) === null) {
      setSetupError(t("Invalid verification code. Check your authenticator app and try again."));
      return;
    }

    try {
      await enableTotp(password, setupUrl, otpCode.trim());
      cancelSetup();
      toast.success(t("Two-factor authentication enabled"));
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : t("Failed to enable 2FA"));
    }
  };

  const handleDisable = async () => {
    if (!password) { setSetupError(t("Password is required")); return; }
    try {
      await disableTotp(password);
      setDisableOpen(false);
      setPassword('');
      setSetupError(null);
      toast.success(t("Two-factor authentication disabled"));
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : t("Failed to disable 2FA"));
    }
  };

  const handleToggle = (enable: boolean) => {
    setSetupError(null);
    if (enable) {
      startSetup();
    } else {
      setDisableOpen(true);
      setPassword('');
    }
  };

  if (isLoadingAuth) {
    return (
      <SettingItem label={t("TOTP Authentication")} description={t("Add an extra layer of security with a time-based one-time password")}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </SettingItem>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingItem label={t("TOTP Authentication")} description={t("Add an extra layer of security with a time-based one-time password")} htmlFor="totp-toggle">
        <div className="flex items-center gap-2">
          <ToggleSwitch
            id="totp-toggle"
            checked={otpEnabled || !!setupUrl}
            onChange={handleToggle}
            disabled={isSaving}
          />
          <span className={cn('text-xs font-medium', otpEnabled ? 'text-success' : 'text-muted-foreground')}>
            {otpEnabled ? t("Enabled") : t("Disabled")}
          </span>
        </div>
      </SettingItem>

      {setupUrl && (
        <div className="ms-4 flex flex-col gap-3 p-3 bg-muted rounded-md">
          <p className="text-xs text-muted-foreground">{t("Copy this URL into your authenticator app (Google Authenticator, Authy, etc.):")}</p>
          {qrDataUrl && (
            <div className="flex justify-center">
              {/* QR codes need a fixed light backdrop for scanner contrast, regardless of theme. */}
              <img src={qrDataUrl} alt="TOTP QR code" className="rounded bg-white p-2" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <code className="text-xs bg-background px-2 py-1 rounded border border-border flex-1 truncate">{setupUrl}</code>
          </div>
          <FieldGroup>
            <Field data-invalid={setupError ? true : undefined}>
              <FieldLabel htmlFor="totp-setup-password">{t("Current Password")}</FieldLabel>
              <Input
                id="totp-setup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-invalid={setupError ? true : undefined}
              />
            </Field>
            <Field data-invalid={setupError ? true : undefined}>
              <FieldLabel htmlFor="totp-setup-code">{t("Verification code")}</FieldLabel>
              <Input
                id="totp-setup-code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                aria-invalid={setupError ? true : undefined}
                aria-describedby={setupError ? 'totp-setup-error' : undefined}
              />
              {setupError && (
                <FieldError id="totp-setup-error" aria-live="polite">
                  {setupError}
                </FieldError>
              )}
            </Field>
          </FieldGroup>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmSetup} disabled={isSaving || !password || !otpCode}>
              {isSaving ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : null}
              {t("Confirm")}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelSetup}>{t("Cancel")}</Button>
          </div>
        </div>
      )}

      {disableOpen && (
        <div className="ms-4 flex flex-col gap-2 p-3 bg-muted rounded-md">
          <p className="text-xs text-muted-foreground">{t("Enter your password to disable two-factor authentication.")}</p>
          <Field data-invalid={setupError ? true : undefined}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("Current Password")}
              aria-label={t("Current Password")}
              autoComplete="current-password"
              aria-invalid={setupError ? true : undefined}
              aria-describedby={setupError ? 'totp-disable-error' : undefined}
            />
            {setupError && (
              <FieldError id="totp-disable-error" aria-live="polite">
                {setupError}
              </FieldError>
            )}
          </Field>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={handleDisable} disabled={isSaving || !password}>
              {isSaving ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : null}
              {t("Disable")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDisableOpen(false); setPassword(''); setSetupError(null); }}>
              {t("Cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function parseIpList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function CredentialRow({ entry, onRemove, isSaving }: { entry: AppPasswordInfo | ApiKeyInfo; onRemove: (id: string) => void; isSaving: boolean }) {
  return (
    <div className="flex items-start justify-between py-2 px-3 bg-muted/50 rounded-md gap-2">
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm text-foreground truncate">{entry.description || entry.id}</span>
        {entry.createdAt && (
          <span className="text-xs text-muted-foreground">
            {new Date(entry.createdAt).toLocaleDateString()}
            {entry.expiresAt ? ` · expires ${new Date(entry.expiresAt).toLocaleDateString()}` : ''}
          </span>
        )}
        {entry.allowedIps.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {entry.allowedIps.map((ip) => (
              <span
                key={ip}
                className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground"
              >
                {ip}
              </span>
            ))}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(entry.id)}
        disabled={isSaving}
        className="text-destructive hover:text-destructive shrink-0"
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
}

interface CredentialSectionProps {
  icon: typeof Smartphone;
  i18nNamespace: 'app_passwords' | 'api_keys';
  entries: Array<AppPasswordInfo | ApiKeyInfo>;
  onCreate: (input: AppCredentialInput) => Promise<{ id: string; secret: string }>;
  onRemove: (id: string) => Promise<void>;
}

function CredentialSection({ icon: Icon, i18nNamespace, entries, onCreate, onRemove }: CredentialSectionProps) {
  const t = useTranslations();
  const tk = (key: string) => t(`settings.security.${i18nNamespace}.${key}`);
  const { isSaving, isLoadingAuth } = useAccountSecurityStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [allowedIpsRaw, setAllowedIpsRaw] = useState('');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDescription.trim()) return;

    try {
      const result = await onCreate({
        description: newDescription.trim(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        allowedIps: parseIpList(allowedIpsRaw),
      });
      setCreatedSecret(result.secret);
      setNewDescription('');
      setExpiresAt('');
      setAllowedIpsRaw('');
      setShowAdd(false);
      toast.success(tk('added'));
    } catch (err) {
      toast.error(tk('add_error'), err instanceof Error ? err.message : undefined);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await onRemove(id);
      toast.success(tk('removed'));
    } catch (err) {
      toast.error(tk('remove_error'), err instanceof Error ? err.message : undefined);
    }
  };

  const handleCopySecret = () => {
    if (!createdSecret) return;
    navigator.clipboard.writeText(createdSecret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isLoadingAuth) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-medium text-foreground">{tk('title')}</h4>
        </div>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-medium text-foreground">{tk('title')}</h4>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-3 h-3 me-1" />
          {t("Add")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{tk('description')}</p>

      {createdSecret && (
        <div className="flex flex-col gap-2 p-3 bg-muted rounded-md">
          <p className="text-xs text-muted-foreground">{tk('copy_now_warning')}</p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-background px-2 py-1 rounded border border-border flex-1 font-mono break-all">
              {createdSecret}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopySecret}>
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCreatedSecret(null)}>
            {t("Done")}
          </Button>
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="p-3 bg-muted rounded-md">
          <div className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${i18nNamespace}-new-name`}>{tk('name_label')}</FieldLabel>
                <Input
                  id={`${i18nNamespace}-new-name`}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder={tk('name_placeholder')}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${i18nNamespace}-new-expires`}>{t("Expires (optional)")}</FieldLabel>
                <Input
                  id={`${i18nNamespace}-new-expires`}
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${i18nNamespace}-new-ips`}>{t("Allowed IPs (optional)")}</FieldLabel>
                <Textarea
                  id={`${i18nNamespace}-new-ips`}
                  value={allowedIpsRaw}
                  onChange={(e) => setAllowedIpsRaw(e.target.value)}
                  placeholder={t("10.0.0.5, 192.168.1.0/24")}
                  rows={2}
                  className="font-mono text-xs"
                  aria-describedby={`${i18nNamespace}-new-ips-hint`}
                />
                <FieldDescription id={`${i18nNamespace}-new-ips-hint`}>
                  {t("Comma- or space-separated. Leave empty to allow any IP.")}
                </FieldDescription>
              </Field>
            </FieldGroup>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={isSaving || !newDescription.trim()}>
                {isSaving ? <Loader2 className="w-4 h-4 me-1 animate-spin" /> : null}
                {t("Create")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                {t("Cancel")}
              </Button>
            </div>
          </div>
        </form>
      )}

      {entries.length > 0 ? (
        <div className="flex flex-col gap-1">
          {entries.map((entry) => (
            <CredentialRow key={entry.id} entry={entry} onRemove={handleRemove} isSaving={isSaving} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">{tk('none')}</p>
      )}
    </div>
  );
}

function AppPasswordsSection() {
  const { appPasswords, createAppPassword, removeAppPassword } = useAccountSecurityStore();
  return (
    <CredentialSection
      icon={Smartphone}
      i18nNamespace="app_passwords"
      entries={appPasswords}
      onCreate={createAppPassword}
      onRemove={removeAppPassword}
    />
  );
}

function ApiKeysSection() {
  const { apiKeys, createApiKey, removeApiKey } = useAccountSecurityStore();
  return (
    <CredentialSection
      icon={Terminal}
      i18nNamespace="api_keys"
      entries={apiKeys}
      onCreate={createApiKey}
      onRemove={removeApiKey}
    />
  );
}

function EncryptionSection() {
  const t = useTranslations();
  const { encryptionType, isLoadingCrypto } = useAccountSecurityStore();

  if (isLoadingCrypto) {
    return (
      <SettingItem label={t("Email Encryption")} description={t("Encrypt stored emails on the server for additional privacy")}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </SettingItem>
    );
  }

  const isEnabled = encryptionType !== 'Disabled';
  return (
    <SettingItem label={t("Email Encryption")} description={t("Encrypt stored emails on the server for additional privacy")}>
      <span className={cn('text-xs font-medium', isEnabled ? 'text-success' : 'text-muted-foreground')}>
        {isEnabled ? t("{type} encryption enabled", { type: encryptionType }) : t("Disabled")}
      </span>
    </SettingItem>
  );
}

function EmailClientSection() {
  const t = useTranslations();
  const { client } = useAuthStore();
  const [copied, setCopied] = useState(false);

  const jmapUsername = useMemo(() => client?.getUsername() || '', [client]);

  const handleCopy = () => {
    navigator.clipboard.writeText(jmapUsername).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Monitor className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-medium text-foreground">{t("Email Client Setup")}</h4>
      </div>
      <p className="text-xs text-muted-foreground">{t("Use these credentials to configure your desktop or mobile email client (Thunderbird, Apple Mail, Outlook, etc.)")}</p>
      <div className="flex flex-col gap-2 p-3 bg-muted/70 dark:bg-muted/40 rounded-md">
        <Field>
          <FieldLabel htmlFor="security-jmap-username">
            {t("JMAP Username")}
          </FieldLabel>
          <div className="flex rounded-lg">
            <Input
              id="security-jmap-username"
              type="text"
              readOnly
              value={jmapUsername}
              className="rounded-e-none border-e-transparent focus-visible:z-10"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="h-9 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-e-lg border border-border bg-muted text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? t("Copied") : t("Copy")}
            </button>
          </div>
        </Field>
        <p className="text-xs text-muted-foreground pt-1">{t("Use your JMAP username above along with an app password to sign in to your email client. Create an app password in the section above if you haven't already.")}</p>
      </div>
    </div>
  );
}

// Cross-device QR login. A signed-in (OAuth/SSO) session mints a short-lived
// pairing code via /api/auth/pair/create; we render it as a QR that the mobile
// app scans to sign in without re-typing credentials. The QR payload carries
// only the server URL and the one-time code — never tokens.
function LinkDeviceSection() {
  const t = useTranslations();
  const params = useParams();
  const locale = params.locale as string;
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Tick the countdown down to zero, then drop the (now useless) QR so the
  // user is nudged to generate a fresh one.
  useEffect(() => {
    if (remaining <= 0) {
      setQrDataUrl(null);
      return;
    }
    const timer = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  // Send the user to the IdP for a fresh login (prompt=login). On return the
  // callback page sets the pairing re-auth proof and bounces back here, where
  // the resume effect below re-runs generate().
  const startReauth = useCallback(async () => {
    try {
      sessionStorage.setItem('pair_reauth_resume', '1');
    } catch { /* sessionStorage unavailable */ }
    const prefix = getPathPrefix(locale);
    const redirectUri = `${window.location.origin}${prefix}/${locale}/auth/callback`;
    const res = await apiFetch('/api/auth/sso/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ redirect_uri: redirectUri, locale, purpose: 'reauth' }),
    });
    if (!res.ok) {
      setError(t("Couldn't create a pairing code. Please try again."));
      return;
    }
    const { authorize_url } = await res.json();
    window.location.href = authorize_url;
  }, [locale, t]);

  // `fromResume` guards against a redirect loop: if we just completed re-auth
  // and pair/create still demands it, surface an error instead of bouncing to
  // the IdP again.
  const generate = useCallback(async (fromResume = false) => {
    setLoading(true);
    setError(null);
    try {
      // Pair the account whose session cookie we'll actually refresh — the
      // active account's slot.
      const slot = useAccountStore.getState().getActiveAccount()?.cookieSlot ?? 0;
      const res = await apiFetch('/api/auth/pair/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slot }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        if (res.status === 401 && errBody?.error === 'reauth_required' && !fromResume) {
          await startReauth();
          return;
        }
        setError(t("Couldn't create a pairing code. Please try again."));
        return;
      }
      const data = await res.json();
      const code = data.pairing_code as string;
      const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 120;
      // The phone redeems the code against THIS webmail (where the pairing
      // record lives), so the QR carries the webmail base — origin plus any
      // mount prefix — not the JMAP server URL. The JMAP server_url comes back
      // in the redeem response.
      const webmailBase = `${window.location.origin}${getPathPrefix()}`;
      const payload = `bulwarkmail://pair?server=${encodeURIComponent(webmailBase)}&code=${encodeURIComponent(code)}`;
      const dataUrl = await QRCode.toDataURL(payload, { width: 240, margin: 1 });
      setQrDataUrl(dataUrl);
      setRemaining(expiresIn);
      setHasGenerated(true);
    } catch {
      setError(t("Couldn't create a pairing code. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [t, startReauth]);

  // Auto-resume after returning from the step-up re-auth round-trip.
  useEffect(() => {
    let resume = false;
    try {
      resume = sessionStorage.getItem('pair_reauth_done') === '1';
      if (resume) sessionStorage.removeItem('pair_reauth_done');
    } catch { /* sessionStorage unavailable */ }
    if (resume) void generate(true);
  }, [generate]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <QrCode className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-medium text-foreground">{t("Link Mobile App")}</h4>
      </div>
      <p className="text-xs text-muted-foreground">{t("Sign in to the Bulwark Mail mobile app without typing anything. Generate a QR code here and scan it from the app's login screen.")}</p>

      {qrDataUrl && remaining > 0 && (
        <div className="flex flex-col gap-2 p-3 bg-muted/70 dark:bg-muted/40 rounded-md">
          <div className="flex justify-center">
            {/* QR codes need a fixed light backdrop for scanner contrast, regardless of theme. */}
            <img src={qrDataUrl} alt="Pairing QR code" className="rounded bg-white p-2" />
          </div>
          <p className="text-xs text-muted-foreground text-center">{t("Open the Bulwark Mail app, tap \"Scan QR code\" on the login screen, and point your camera here.")}</p>
          <p className="text-[11px] text-muted-foreground text-center">
            {t("This code expires in {seconds} seconds. It can only be used once.", { seconds: remaining })}
          </p>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button variant="outline" size="sm" onClick={() => void generate()} disabled={loading}>
        {loading ? (
          <Loader2 className="w-3 h-3 me-1 animate-spin" />
        ) : (
          <QrCode className="w-3 h-3 me-1" />
        )}
        {hasGenerated ? t("Show a new code") : t("Show QR code")}
      </Button>
    </div>
  );
}

export function AccountSecuritySettings() {
  const t = useTranslations();
  const { isStalwart, isProbing, probe, fetchAll, fetchAuthInfo } = useAccountSecurityStore();
  const { isAuthenticated, authMode, client } = useAuthStore();
  const isOAuth = authMode === 'oauth';

  // Wait for `client` before probing. On reload the persisted `isAuthenticated`
  // flips true before the async OAuth reconnect sets `client`; probing in that
  // window reads a null client, decides the server isn't Stalwart, and caches
  // that wrong verdict. Gating on `client` (which is set only after connect()
  // populates the session capabilities) makes the probe run with real data.
  useEffect(() => {
    if (isAuthenticated && client && isStalwart === null) {
      probe().then((detected) => {
        if (detected) {
          if (isOAuth) {
            fetchAuthInfo();
          } else {
            fetchAll();
          }
        }
      });
    }
  }, [isAuthenticated, client, isStalwart, probe, fetchAll, fetchAuthInfo, isOAuth]);

  if (isProbing) {
    return (
      <SettingsSection title={t("Account Security")} description={t("Manage your password, two-factor authentication, and security settings")}>
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t("Detecting server capabilities...")}</span>
        </div>
      </SettingsSection>
    );
  }

  if (isStalwart === false) {
    // Even when Stalwart account-management isn't exposed (common for OAuth
    // sessions, whose tokens may lack the management capability), the
    // cross-device mobile pairing still works — it only needs the OAuth
    // refresh-token cookie, not `urn:stalwart:jmap`. So surface the QR linker
    // for OAuth sessions and show the "not available" note for the rest.
    // Use t.raw (not t) because the message is hand-injected HTML; passing it
    // through t() makes next-intl try to parse the <a> tag and throw
    // INVALID_TAG.
    return (
      <SettingsSection title={t("Account Security")} description={t("Manage your password, two-factor authentication, and security settings")}>
        {isOAuth ? (
          <div className="flex flex-col gap-6">
            <LinkDeviceSection />
            <div className="border-t border-border" />
            <div className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeI18nHtml(t.raw("Account security management is not available for this mail server. Required permissions may be disabled. See the <a href=\"/docs/guides/account-security\" class=\"underline hover:opacity-80\" target=\"_blank\">documentation</a> for details.")) }} />
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-4" dangerouslySetInnerHTML={{ __html: sanitizeI18nHtml(t.raw("Account security management is not available for this mail server. Required permissions may be disabled. See the <a href=\"/docs/guides/account-security\" class=\"underline hover:opacity-80\" target=\"_blank\">documentation</a> for details.")) }} />
        )}
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title={t("Account Security")} description={t("Manage your password, two-factor authentication, and security settings")}>
      <div className="flex flex-col gap-6">
        {!isOAuth && (
          <>
            <PasswordChangeSection />
            <div className="border-t border-border" />
            <DisplayNameSection />
            <div className="border-t border-border" />
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-sm font-medium text-foreground">{t("Two-Factor Authentication")}</h4>
              </div>
              <TotpSection />
            </div>
            <div className="border-t border-border" />
          </>
        )}

        <AppPasswordsSection />

        <div className="border-t border-border" />
        <ApiKeysSection />

        {isOAuth && (
          <>
            <div className="border-t border-border" />
            <EmailClientSection />
            <div className="border-t border-border" />
            <LinkDeviceSection />
          </>
        )}

        {!isOAuth && (
          <>
            <div className="border-t border-border" />
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-sm font-medium text-foreground">{t("Encryption at Rest")}</h4>
              </div>
              <EncryptionSection />
            </div>
          </>
        )}
      </div>
    </SettingsSection>
  );
}
