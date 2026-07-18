import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom does not implement matchMedia; components that read media queries
// (e.g. responsive layout hooks) call it during render. Provide a minimal
// no-match stub so those components can render under test.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

vi.mock('@/i18n/client', () => {
  const t = (key: string) => key;
  t.raw = (key: string) => key;
  t.has = () => true;
  return {
    useTranslations: () => t,
    useLocale: () => 'en',
    useFormatter: () => ({
      dateTime: (d: Date | string) => String(d),
      number: (n: number) => String(n),
    }),
    useMessages: () => ({}),
    makeI18n: () => ({}),
    makeTranslator: () => t,
    I18nProviderContext: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ locale: 'en' }),
  usePathname: () => '/en',
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/en',
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(() => {
  cleanup();
});
