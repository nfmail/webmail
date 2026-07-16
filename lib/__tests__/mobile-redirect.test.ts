import { describe, expect, it } from 'vitest';
import {
  MOBILE_REDIRECT_SCHEME,
  isMobileRedirectUri,
} from '@/lib/auth/mobile-redirect';

describe('NF Mail mobile redirect URI', () => {
  it('uses the canonical NF Mail deep-link scheme', () => {
    expect(MOBILE_REDIRECT_SCHEME).toBe('nfmail://');
    expect(isMobileRedirectUri('nfmail://auth/callback')).toBe(true);
    expect(isMobileRedirectUri('nfmail://auth/callback?state=opaque')).toBe(true);
  });

  it('rejects the retired upstream scheme and ordinary web redirects', () => {
    expect(isMobileRedirectUri('bulwarkmobile://auth/callback')).toBe(false);
    expect(isMobileRedirectUri('https://attacker.example/callback')).toBe(false);
    expect(isMobileRedirectUri('javascript:alert(1)')).toBe(false);
  });

  it('rejects malformed and credential-bearing lookalikes', () => {
    expect(isMobileRedirectUri('nfmail://')).toBe(false);
    expect(isMobileRedirectUri('nfmail://user:password@auth/callback')).toBe(false);
    expect(isMobileRedirectUri('nfmail:auth/callback')).toBe(false);
    expect(isMobileRedirectUri(null)).toBe(false);
  });
});
