"use client";

import { createContext, useContext, useMemo } from 'react';
import { setupI18n, type I18n } from '@lingui/core';
import { catalogFor } from './catalogs';
import { defaultLocale } from './routing';

/**
 * Client-side i18n built on @lingui/core with next-intl-compatible hook
 * shapes, so the ~1400 existing `t("key")` call sites keep working unchanged
 * (explicit dotted IDs, `{param}` interpolation, ICU plurals — see ADR 0010
 * in the private repo and docs/i18n.md).
 */

export interface Translator {
  (key: string, values?: Record<string, unknown>): string;
  /** next-intl compat: the unformatted message (used for sanitized HTML strings). */
  raw(key: string): string;
  /** next-intl compat: whether the key exists in the catalog. */
  has(key: string): boolean;
}

interface I18nContextValue {
  i18n: I18n;
  locale: string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function makeI18n(locale: string): I18n {
  return setupI18n({
    locale,
    messages: { [locale]: catalogFor(locale) as Record<string, string> },
  });
}

// Fallback instance so hooks render sensible English text even outside the
// provider (isolated component tests, error boundaries above the provider).
let fallbackInstance: I18nContextValue | null = null;
function fallbackCtx(): I18nContextValue {
  if (!fallbackInstance) {
    fallbackInstance = { i18n: makeI18n(defaultLocale), locale: defaultLocale };
  }
  return fallbackInstance;
}

export function I18nProviderContext({
  value,
  children,
}: {
  value: I18nContextValue;
  children: React.ReactNode;
}) {
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18nContext(): I18nContextValue {
  return useContext(I18nContext) ?? fallbackCtx();
}

export function makeTranslator(i18n: I18n, namespace?: string): Translator {
  const resolve = (key: string) => (namespace ? `${namespace}.${key}` : key);
  const translate = (key: string, values?: Record<string, unknown>): string => {
    const id = resolve(key);
    try {
      return i18n._(id, values);
    } catch {
      // A malformed ICU message or missing plural value must never crash the
      // UI; fall back to the raw ID like next-intl's error path did.
      return id;
    }
  };
  const t = translate as Translator;
  t.raw = (key: string) => translate(key);
  t.has = (key: string) => resolve(key) in (i18n.messages ?? {});
  return t;
}

/** next-intl-compatible translation hook: `const t = useTranslations("ns")`. */
export function useTranslations(namespace?: string): Translator {
  const { i18n } = useI18nContext();
  return useMemo(() => makeTranslator(i18n, namespace), [i18n, namespace]);
}

/** The active UI locale (user choice > negotiated request locale). */
export function useLocale(): string {
  return useI18nContext().locale;
}

/** next-intl-compatible formatter; only dateTime is used in this codebase. */
export function useFormatter() {
  const { locale } = useI18nContext();
  return useMemo(
    () => ({
      dateTime(date: Date | number, options?: Intl.DateTimeFormatOptions): string {
        return new Intl.DateTimeFormat(locale, options).format(date);
      },
      number(value: number, options?: Intl.NumberFormatOptions): string {
        return new Intl.NumberFormat(locale, options).format(value);
      },
    }),
    [locale],
  );
}

function setPath(target: Record<string, unknown>, path: string[], value: string): void {
  let node = target;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    const next = node[seg];
    if (next && typeof next === 'object') {
      node = next as Record<string, unknown>;
    } else {
      const created: Record<string, unknown> = {};
      node[seg] = created;
      node = created;
    }
  }
  node[path[path.length - 1]] = value;
}

/**
 * next-intl compat: the full message tree as a nested object of formatted
 * strings (the settings search index walks it). Rebuilt from the flat catalog.
 */
export function useMessages(): Record<string, unknown> {
  const { i18n, locale } = useI18nContext();
  return useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const id of Object.keys(catalogFor(locale))) {
      let text: string;
      try {
        text = i18n._(id);
      } catch {
        text = id;
      }
      setPath(out, id.split('.'), text);
    }
    return out;
  }, [i18n, locale]);
}
