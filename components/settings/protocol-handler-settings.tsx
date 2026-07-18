"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { getPathPrefix } from "@/lib/browser-navigation";
import { useSettingsStore } from "@/stores/settings-store";
import type { ProtocolOpenMode } from "@/stores/settings-store";
import { toast } from "@/stores/toast-store";
import { SettingsSection, SettingItem, Select } from "./settings-section";

type Protocol = "mailto" | "webcal";

function canRegisterProtocolHandler(): boolean {
  return typeof navigator !== "undefined"
    && "registerProtocolHandler" in navigator
    && typeof window !== "undefined"
    && window.isSecureContext;
}

function getProtocolHandlerUrl(protocol: Protocol) {
  return `${window.location.origin}${getPathPrefix()}/protocol/${protocol}?url=%s`;
}

function registerProtocolHandler(protocol: Protocol) {
  navigator.registerProtocolHandler(
    protocol,
    getProtocolHandlerUrl(protocol),
  );
}

interface ProtocolHandlerSettingsProps {
  supportsCalendar: boolean;
}

export function ProtocolHandlerSettings({ supportsCalendar }: ProtocolHandlerSettingsProps) {
  const t = useTranslations();
  const protocolOpenMode = useSettingsStore((state) => state.protocolOpenMode);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(canRegisterProtocolHandler());
  }, []);

  const handleOpenModeChange = async (value: string) => {
    const openMode = value as ProtocolOpenMode;

    if (openMode === "active-session"
      && typeof window !== "undefined"
      && "Notification" in window
      && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    updateSetting("protocolOpenMode", openMode);
  };

  const handleRegister = (protocol: Protocol) => {
    try {
      registerProtocolHandler(protocol);
      toast.success(protocol === "mailto" ? t("Email handler registration requested") : t("Calendar handler registration requested"));
    } catch {
      toast.error(t("Protocol handler registration failed"));
    }
  };

  const renderRegistrationControl = (protocol: Protocol) => {
    return (
      <Button size="sm" onClick={() => handleRegister(protocol)} disabled={!supported}>
        {protocol === "mailto" ? t("Register email app") : t("Register calendar app")}
      </Button>
    );
  };

  return (
    <SettingsSection title={t("Default apps")} description={t("Choose whether email and calendar links open in Bulwark. Technically, Bulwark registers as a protocol handler for mailto: and webcal: links.")}>
      {!supported && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("This browser or connection does not support manual protocol-handler registration. You may still be able to use the installed PWA via browser or OS settings.")}
        </div>
      )}

      <SettingItem label={t("Email links")} description={t("Open mailto: links in Bulwark with a prefilled composer.")}>
        {renderRegistrationControl("mailto")}
      </SettingItem>

      {supportsCalendar && (
        <SettingItem label={t("Calendar links")} description={t("Open webcal: links in Bulwark with a prefilled calendar subscription dialog.")}>
          {renderRegistrationControl("webcal")}
        </SettingItem>
      )}

      <SettingItem label={t("When opening protocol links")} description={t("Choose whether Bulwark opens mailto: and webcal: links in a new tab or reuses an open session. The active-session option needs notification permission so you can click a fallback notification to bring Bulwark to the front if the browser blocks focus.")} htmlFor="protocol-open-mode-select">
        <Select
          id="protocol-open-mode-select"
          value={protocolOpenMode}
          onChange={handleOpenModeChange}
          options={[
            { value: "new-tab", label: t("Always open a new tab") },
            { value: "active-session", label: t("Open in active session if possible") },
          ]}
        />
      </SettingItem>

      <p className="text-xs text-muted-foreground">{t("Your browser or operating system may ask you to confirm this and may require Bulwark to be installed before it can be selected as the default app.")}</p>
    </SettingsSection>
  );
}
