import { test, expect } from '@playwright/test';

/**
 * Locale smoke: the maintained locales (en, hu) render translated UI and the
 * NEXT_LOCALE cookie drives server-side negotiation end to end (proxy rewrite
 * -> [locale] segment -> client provider).
 */
test.describe('i18n locale smoke', () => {
  test('renders English by default', async ({ page }) => {
    await page.goto('/en/login', { waitUntil: 'load' });
    await expect(page.getByRole('button', { name: 'Sign in', exact: false })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('renders Hungarian when the NEXT_LOCALE cookie says hu', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: 'hu', url: baseURL ?? 'http://localhost:3100' },
    ]);
    const page = await context.newPage();
    await page.goto('/login', { waitUntil: 'load' });
    await expect(page.getByRole('button', { name: 'Bejelentkezés', exact: false })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
    await context.close();
  });
});
