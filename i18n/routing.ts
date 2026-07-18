// Locale prefix mode can be configured via NEXT_PUBLIC_LOCALE_PREFIX.
// - "never"    (default): /settings - locale from cookie/Accept-Language
// - "always":             /en/settings - locale always in the URL
// - "as-needed":          /settings for default locale, /fr/settings otherwise
// When proxying under a sub-path (NEXT_PUBLIC_BASE_PATH), "always" is
// recommended so locale detection cannot conflict with the proxy's path
// rewriting.
export type LocalePrefixMode = 'never' | 'always' | 'as-needed';

const localePrefixMode = (process.env.NEXT_PUBLIC_LOCALE_PREFIX ?? 'never') as LocalePrefixMode;

const SUPPORTED_LOCALES = ['en', 'hu'] as const;

// Fallback locale used when the visitor's Accept-Language header does not
// match any supported locale (and no NEXT_LOCALE cookie is set yet). Admins
// set this via NEXT_PUBLIC_DEFAULT_LOCALE at build time to localise greenfield
// deployments without having every user change their preference manually.
const envDefaultLocale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE?.trim();
const resolvedDefaultLocale =
  envDefaultLocale && (SUPPORTED_LOCALES as readonly string[]).includes(envDefaultLocale)
    ? (envDefaultLocale as (typeof SUPPORTED_LOCALES)[number])
    : 'en';

/** Cookie that persists the negotiated locale across requests. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const routing = {
  locales: SUPPORTED_LOCALES,
  defaultLocale: resolvedDefaultLocale,
  localePrefix: localePrefixMode,
} as const;

export const locales = routing.locales;
export const defaultLocale = routing.defaultLocale;
export const localePrefix = routing.localePrefix;
export type Locale = (typeof locales)[number];

export function isSupportedLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/** Best supported locale for an Accept-Language header value, or null. */
export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { base: tag.toLowerCase().split('-')[0], q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { base } of ranked) {
    if (isSupportedLocale(base)) return base;
  }
  return null;
}
