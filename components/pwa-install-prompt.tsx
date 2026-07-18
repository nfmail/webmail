"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/i18n/client";
import { X, Download } from "lucide-react";
import { useConfig } from "@/hooks/use-config";
import { withBasePath } from "@/lib/browser-navigation";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed";

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const { appName, faviconUrl, appLogoLightUrl, appLogoDarkUrl } = useConfig();
  const t = useTranslations();

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  const handleDismissForever = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShowPrompt(false);
  };

  if (!showPrompt || !deferredPrompt) {
    return null;
  }

  const logoSrc = withBasePath(appLogoLightUrl || faviconUrl);
  const darkLogoSrc = withBasePath(appLogoDarkUrl || faviconUrl);

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-popover text-popover-foreground rounded-lg shadow-lg border border-border p-4 max-w-sm animate-in slide-in-from-bottom-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={appName}
              className="w-8 h-8 shrink-0 object-contain dark:hidden"
            />
          ) : (
            <Download className="w-5 h-5 mt-0.5 text-info shrink-0" />
          )}
          {logoSrc && (
            <img
              src={darkLogoSrc}
              alt={appName}
              className="w-8 h-8 shrink-0 object-contain hidden dark:block"
            />
          )}
          <div>
            <h3 className="font-semibold text-sm text-foreground">
              {t("Install {appName}", { appName })}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("Install our app for quick access and offline support.")}
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t("Dismiss install prompt")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            onClick={handleDismiss}
            className="flex-1 px-3 py-2 text-sm font-medium text-secondary-foreground bg-secondary rounded hover:bg-secondary/80 transition-colors"
          >
            {t("Not now")}
          </button>
          <button
            onClick={handleInstall}
            className="flex-1 px-3 py-2 text-sm font-medium text-primary-foreground bg-primary rounded hover:bg-primary/90 transition-colors"
          >
            {t("Install")}
          </button>
        </div>
        <button
          onClick={handleDismissForever}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
        >
          {t("Don't remind me again")}
        </button>
      </div>
    </div>
  );
}
