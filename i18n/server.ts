import { cookies, headers } from 'next/headers';
import { setupI18n } from '@lingui/core';
import { catalogFor } from './catalogs';
import {
  LOCALE_COOKIE,
  defaultLocale,
  isSupportedLocale,
  localeFromAcceptLanguage,
} from './routing';

/**
 * Server-side i18n helpers with next-intl-compatible signatures, built on the
 * compiled Lingui catalogs. Used by the few server components/route handlers
 * that render localized text outside the client provider.
 */

export interface ServerTranslator {
  (key: string, values?: Record<string, unknown>): string;
  raw(key: string): string;
}

/** Negotiate the request locale: NEXT_LOCALE cookie, then Accept-Language, then default. */
export async function getLocale(): Promise<string> {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isSupportedLocale(cookieLocale)) return cookieLocale;
  const accept = (await headers()).get('accept-language');
  return localeFromAcceptLanguage(accept) ?? defaultLocale;
}

export async function getTranslations(
  namespaceOrOptions?: string | { locale?: string; namespace?: string },
): Promise<ServerTranslator> {
  const options =
    typeof namespaceOrOptions === 'string'
      ? { namespace: namespaceOrOptions }
      : (namespaceOrOptions ?? {});
  const locale =
    options.locale && isSupportedLocale(options.locale) ? options.locale : await getLocale();
  const i18n = setupI18n({
    locale,
    messages: { [locale]: catalogFor(locale) as Record<string, string> },
  });
  const resolve = (key: string) => (options.namespace ? `${options.namespace}.${key}` : key);
  const translate = (key: string, values?: Record<string, unknown>): string => {
    try {
      return i18n._(resolve(key), values);
    } catch {
      return resolve(key);
    }
  };
  const t = translate as ServerTranslator;
  t.raw = (key: string) => translate(key);
  return t;
}
