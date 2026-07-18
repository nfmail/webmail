"use client";

import NextLink from 'next/link';
import {
  redirect as nextRedirect,
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from 'next/navigation';
import { createElement, forwardRef, useMemo, type ComponentProps } from 'react';
import { useLocale } from './client';
import { defaultLocale, isSupportedLocale, localePrefix } from './routing';

/**
 * Locale-aware navigation with the same exports next-intl's createNavigation
 * provided (Link / redirect / usePathname / useRouter), honoring the
 * NEXT_PUBLIC_LOCALE_PREFIX mode:
 *  - "never": URLs carry no locale prefix (the proxy rewrites internally)
 *  - "always": every URL is prefixed
 *  - "as-needed": all but the default locale are prefixed
 */

export function localizeHref(href: string, locale: string): string {
  if (!href.startsWith('/')) return href;
  if (localePrefix === 'never') return href;
  if (localePrefix === 'as-needed' && locale === defaultLocale) return href;
  return href === '/' ? `/${locale}` : `/${locale}${href}`;
}

/** Strip a leading supported-locale segment from a pathname. */
export function stripLocalePrefix(pathname: string): string {
  const [, first, ...rest] = pathname.split('/');
  if (isSupportedLocale(first)) {
    const stripped = `/${rest.join('/')}`;
    return stripped === '/' ? '/' : stripped.replace(/\/$/, '');
  }
  return pathname;
}

type LinkProps = ComponentProps<typeof NextLink> & { locale?: string };

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, locale, ...rest },
  ref,
) {
  const activeLocale = useLocale();
  const target =
    typeof href === 'string' ? localizeHref(href, locale ?? activeLocale) : href;
  return createElement(NextLink, { ref, href: target, ...rest });
});

/** The current pathname without its locale prefix. */
export function usePathname(): string {
  return stripLocalePrefix(useNextPathname());
}

export function useRouter() {
  const router = useNextRouter();
  const locale = useLocale();
  return useMemo(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) =>
        router.push(localizeHref(href, locale), options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) =>
        router.replace(localizeHref(href, locale), options),
      prefetch: (href: string, options?: Parameters<typeof router.prefetch>[1]) =>
        router.prefetch(localizeHref(href, locale), options),
    }),
    [router, locale],
  );
}

export function redirect(href: string): never {
  nextRedirect(localizeHref(href, defaultLocale));
}
