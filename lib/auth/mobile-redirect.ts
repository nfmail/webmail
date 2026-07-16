import { PRODUCT } from '@/lib/product-metadata';

export const MOBILE_REDIRECT_SCHEME = `${PRODUCT.mobileRedirectScheme}://`;

/**
 * Restrict token-bearing mobile handoffs to NF Mail's registered deep-link
 * scheme. Parsing as a URL rejects malformed values that merely share the
 * expected prefix.
 */
export function isMobileRedirectUri(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith(MOBILE_REDIRECT_SCHEME)) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === `${PRODUCT.mobileRedirectScheme}:` &&
      url.hostname.length > 0 &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}
