import { notFound } from "next/navigation";
import { IntlProvider } from "@/components/providers/intl-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CalendarAlertProvider } from "@/components/providers/calendar-alert-provider";
import { EmbeddedBridgeProvider } from "@/components/providers/embedded-bridge-provider";
import { RateLimitToastProvider } from "@/components/providers/rate-limit-toast-provider";
import { TourProvider } from "@/components/tour/tour-provider";
import { ProtocolLaunchHandlerProvider } from "@/components/protocol/protocol-launch-handler-provider";
import { ProInterfaceRedirect } from "@/components/pro/pro-interface-redirect";
import { PluginDialogHost } from "@/components/plugins/plugin-dialog-host";
import { PluginConsentDialog } from "@/components/plugins/plugin-consent-dialog";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { locales } from "@/i18n/routing";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!(locales as readonly string[]).includes(locale)) notFound();

  let messages;
  try {
    messages = (await import(`@/locales/${locale}/common.json`)).default;
  } catch {
    notFound();
  }

  return (
    <IntlProvider locale={locale} messages={messages}>
      <ThemeProvider>
        <CalendarAlertProvider>
          <RateLimitToastProvider>
            <EmbeddedBridgeProvider>
              <TourProvider>
                <ProtocolLaunchHandlerProvider>
                  <ProInterfaceRedirect />
                  {/* Primary landmark for every localized surface. `display:contents`
                      keeps the full-viewport page layouts intact while still
                      exposing a single <main> to assistive tech (axe
                      landmark-one-main / region). */}
                  <main className="contents">{children}</main>
                  <PluginDialogHost />
                  <PluginConsentDialog />
                  <PWAInstallPrompt />
                </ProtocolLaunchHandlerProvider>
              </TourProvider>
            </EmbeddedBridgeProvider>
          </RateLimitToastProvider>
        </CalendarAlertProvider>
      </ThemeProvider>
    </IntlProvider>
  );
}
