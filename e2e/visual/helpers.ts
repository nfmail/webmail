import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Shared helpers for the pre-migration visual-regression baseline.
 *
 * The suite runs against the built-in mock JMAP backend (DEV_MOCK_JMAP=true),
 * which serves deterministic dummy mail/calendar/contact data and exposes a
 * one-click "Sign in" dev-login button on the login page (no real credentials).
 * See e2e/visual/README.md for the full rationale and update procedure.
 */

export const BASE_URL = process.env.PLAYWRIGHT_VISUAL_BASE_URL || 'http://localhost:3100';

/** Default screenshot comparison options applied to every surface. */
export const SHOT_OPTS = {
  animations: 'disabled' as const,
  // A small tolerance absorbs sub-pixel font rendering noise while still
  // catching the structural/spacing/colour regressions a component migration
  // is likely to introduce.
  maxDiffPixelRatio: 0.02,
};

/**
 * CSS that neutralises non-deterministic chrome:
 *  - the Next.js dev-tools overlay / error badge (dev server only),
 *  - transitions/animations and the blinking text caret.
 * Injected on every navigation so it survives client-side route changes.
 */
const STABILITY_CSS = `
  nextjs-portal,
  [data-nextjs-toast],
  [data-next-badge-root],
  #__next-build-watcher { display: none !important; }
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
`;

export async function injectStability(page: Page): Promise<void> {
  await page.addStyleTag({ content: STABILITY_CSS }).catch(() => {
    /* page may be mid-navigation; the next call re-applies it */
  });
}

/** Give the SPA time to settle after a navigation, then re-apply stability CSS. */
export async function settle(page: Page, ms = 2500): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(ms);
  await injectStability(page);
}

/**
 * Log in through the mock backend's dev-login button and land on the mailbox.
 * Also dismisses the first-run welcome tour so the mail list is deterministic.
 */
export async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/en/login`, { waitUntil: 'load' });
  await page.getByRole('button', { name: /sign in/i }).click({ timeout: 45_000 });
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45_000 });
  await settle(page, 3500);
  await dismissTour(page);
}

/** Dismiss the "Welcome to your mailbox" onboarding card if present. */
export async function dismissTour(page: Page): Promise<void> {
  const gotIt = page.getByRole('button', { name: /got it/i });
  if (await gotIt.count()) {
    await gotIt.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

/**
 * Click a primary navigation entry (rail on desktop/tablet, bottom tab bar on
 * mobile). Both layouts render the same `a[href="/<section>"]` anchor, so a
 * single selector covers every viewport. Navigation is client-side, which
 * preserves the in-memory JMAP session (a full page reload would lose it,
 * because the dev login does not enable "remember me").
 */
export async function navigate(
  page: Page,
  section: 'calendar' | 'contacts' | 'files' | 'settings',
): Promise<void> {
  await page.locator(`a[href="/${section}"]`).first().click();
  await settle(page, 3000);
}

/** Return true when the Files section is reachable (requires a WebDAV backend). */
export async function filesAvailable(page: Page): Promise<boolean> {
  return (await page.locator('a[href="/files"]').count()) > 0;
}

/**
 * Dynamic regions to mask out of comparisons. `.tabular-nums` covers the
 * relative mail timestamps and the folder/label/unread counters, all of which
 * are generated relative to "now" by the mock backend and therefore drift
 * between runs. Extra per-surface locators can be appended by the caller.
 */
export function dynamicMasks(page: Page): Locator[] {
  return [page.locator('.tabular-nums')];
}

/** Take the baseline/comparison screenshot for a named surface. */
export async function shootSurface(
  page: Page,
  name: string,
  extraMasks: Locator[] = [],
): Promise<void> {
  await injectStability(page);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    ...SHOT_OPTS,
    mask: [...dynamicMasks(page), ...extraMasks],
  });
}
