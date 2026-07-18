import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  BASE_URL,
  login,
  navigate,
  settle,
  dismissTour,
  filesAvailable,
  freezeClock,
  shootSurface,
  injectStability,
  SHOT_OPTS,
  dynamicMasks,
} from './helpers';

/**
 * Pre-migration visual-regression baseline for NF Mail's key surfaces.
 *
 * Captured BEFORE the shadcn/ui migration so every migration PR can be diffed
 * against a known-good reference. Each Playwright project pins one
 * viewport + colour-scheme combination (see playwright.visual.config.ts); the
 * project name is appended to every snapshot file, so one spec produces the
 * full viewport x theme matrix.
 */

// ---------------------------------------------------------------------------
// Unauthenticated surface (fresh context per test via the default fixture).
// ---------------------------------------------------------------------------
test.describe('visual: unauthenticated', () => {
  test('login', async ({ page }) => {
    await freezeClock(page);
    await page.goto(`${BASE_URL}/en/login`, { waitUntil: 'load' });
    await page.getByRole('button', { name: /sign in/i }).waitFor({ timeout: 45_000 });
    await settle(page, 1500);
    await expect(page).toHaveScreenshot('login.png', {
      ...SHOT_OPTS,
      // The self-update notice depends on a network check and is irrelevant to
      // component styling.
      mask: [...dynamicMasks(page), page.getByText(/new version available/i)],
    });
  });
});

// ---------------------------------------------------------------------------
// Authenticated surfaces. One shared, logged-in page per project keeps the
// in-memory JMAP session alive; navigation between surfaces is client-side.
// `serial` ensures the shared page is used sequentially.
// ---------------------------------------------------------------------------
test.describe.serial('visual: authenticated', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    const use = testInfo.project.use;
    context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: use.viewport ?? undefined,
      colorScheme: use.colorScheme ?? undefined,
      reducedMotion: 'reduce',
    });
    page = await context.newPage();
    await freezeClock(page);
    await login(page);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('mail-list', async () => {
    // The app opens on the mailbox right after login; returnToMail is a no-op
    // when already there and clicks the Mail entry otherwise.
    await returnToMail(page);
    await shootSurface(page, 'mail-list');
  });

  test('thread-view', async () => {
    await returnToMail(page);
    // Open a deterministic conversation by its subject line.
    await page.getByText('GitHub Notifications').first().click();
    await settle(page, 2500);
    await shootSurface(page, 'thread-view');
  });

  test('composer', async () => {
    await returnToMail(page);
    await page.keyboard.press('c');
    await settle(page, 2000);
    // Confirm the composer actually opened before shooting.
    await expect(page.getByText(/new message/i).first()).toBeVisible({ timeout: 10_000 });
    await shootSurface(page, 'composer');
    await page.keyboard.press('Escape').catch(() => {});
  });

  test('settings-main', async () => {
    await navigate(page, 'settings');
    await shootSurface(page, 'settings-main');
  });

  test('settings-subpage', async () => {
    await navigate(page, 'settings');
    // Open the Account section (a stable, always-present settings sub-surface).
    const account = page
      .getByRole('button', { name: 'Account' })
      .or(page.getByText('Account', { exact: true }));
    await account.first().click();
    await settle(page, 1500);
    await shootSurface(page, 'settings-subpage');
  });

  test('calendar', async () => {
    await navigate(page, 'calendar');
    // Guard against a mis-fired navigation shooting the wrong surface: the
    // "Today" toolbar button only exists on the calendar.
    await page.getByRole('button', { name: /today/i }).first().waitFor({ timeout: 15_000 });
    // The browser clock and mock fixtures are both pinned to FIXED_NOW, so the
    // whole calendar body (grid, events, today marker) is deterministic and
    // stays under test unmasked.
    await shootSurface(page, 'calendar');
  });

  test('contacts', async () => {
    await navigate(page, 'contacts');
    await shootSurface(page, 'contacts');
  });

  test('files', async () => {
    // The Files nav entry renders on every surface, so availability can be
    // checked from wherever the previous test left the shared page — no
    // navigation required (navigating first risked a hang on the skip path).
    const available = await filesAvailable(page);
    test.skip(
      !available,
      'Files nav is hidden: the mock backend advertises no WebDAV capability. ' +
        'Run against a backend where supportsFiles is true to baseline this surface.',
    );
    // Navigate from the mailbox: on tablet the contacts surface overlays the
    // nav rail and renders no bottom bar, leaving no reachable files anchor.
    await returnToMail(page);
    await navigate(page, 'files');
    // Wait for a stable listing row so the shot never captures a half-loaded
    // tree (see e2e/visual/README.md).
    await page.getByText('Documents').first().waitFor({ timeout: 15_000 });
    await shootSurface(page, 'files');
  });
});

/**
 * Return to the mailbox using in-app navigation. Prefers the Mail rail/tab
 * anchor; falls back to a fresh login if the session was lost.
 */
async function returnToMail(page: Page): Promise<void> {
  const url = new URL(page.url());
  if (url.pathname === '/' || url.pathname === '/en' || url.pathname.endsWith('/en/')) {
    await injectStability(page);
    return;
  }
  const mailLink = page.locator('a[href="/"], a[href="/en"]').first();
  if (await mailLink.count()) {
    await mailLink.click({ timeout: 10_000 }).catch(() => {});
    // Overlay-proof fallback (tablet surfaces can cover the rail while no
    // bottom bar renders): fire the router handler directly.
    if (!/\/(en\/?)?$/.test(new URL(page.url()).pathname)) {
      await page
        .evaluate(() => {
          (document.querySelector('a[href="/"], a[href="/en"]') as HTMLElement | null)?.click();
        })
        .catch(() => {});
    }
    await settle(page, 2500);
    if (!page.url().includes('/login')) {
      await dismissTour(page);
      return;
    }
  }
  // Session lost (e.g. after a hard navigation) — re-establish it.
  await login(page);
}
