"use client";

import { useEffect, useMemo, useState } from 'react';
import { I18nProviderContext, makeI18n } from '@/i18n/client';
import { getLocaleDirection } from '@/i18n/direction';
import { detectBrowserLocale } from '@/i18n/detect-locale';
import { useLocaleStore } from '@/stores/locale-store';

interface IntlProviderProps {
  locale: string;
  children: React.ReactNode;
}

/**
 * Client i18n provider on the compiled Lingui catalogs (en + hu, see
 * i18n/catalogs.ts). The active locale follows the user's stored choice from
 * the locale store; empty or 'auto' means "follow the browser" with English
 * as the default. Switching locales is instant — no navigation — because the
 * catalogs ship with the bundle.
 */
export function IntlProvider({ locale: initialLocale, children }: IntlProviderProps) {
  const currentLocale = useLocaleStore((state) => state.locale);
  const [activeLocale, setActiveLocale] = useState(initialLocale);

  // Resolve the active locale from the user's stored choice. Empty or 'auto'
  // means "follow the browser" (English default); a specific code forces it
  // and is never overridden by detection.
  useEffect(() => {
    setActiveLocale(
      !currentLocale || currentLocale === 'auto'
        ? detectBrowserLocale(initialLocale)
        : currentLocale
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocale]);

  // Keep <html> lang/dir in sync with the active locale.
  useEffect(() => {
    document.documentElement.lang = activeLocale;
    document.documentElement.dir = getLocaleDirection(activeLocale);
  }, [activeLocale]);

  const value = useMemo(
    () => ({ i18n: makeI18n(activeLocale), locale: activeLocale }),
    [activeLocale]
  );

  return <I18nProviderContext value={value}>{children}</I18nProviderContext>;
}
