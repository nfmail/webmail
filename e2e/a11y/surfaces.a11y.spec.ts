import { test, type BrowserContext, type Page } from '@playwright/test';
import { BASE_URL, login, navigate, settle, dismissTour } from '../visual/helpers';
import { checkA11y } from './axe-helper';

/**
 * Automated accessibility scans of NF Mail's key surfaces.
 *
 * Runs axe-core against each surface using the same mock-JMAP-backed server as
 * the visual-regression suite (playwright.a11y.config.ts boots it with
 * DEV_MOCK_JMAP=true). The login / navigation helpers are reused verbatim from
 * ../visual/helpers so the two suites stay in lock-step on how they reach each
 * surface.
 *
 * Failure policy (see e2e/a11y/README.md and axe-helper.ts):
 *  - serious / critical violations fail the test,
 *  - moderate / minor violations are attached to the report but do not fail.
 */

// ---------------------------------------------------------------------------
// Unauthenticated surface.
// ---------------------------------------------------------------------------
test.describe('a11y: unauthenticated', () => {
  test('login', async ({ page }) => {
    await page.goto(`${BASE_URL}/en/login`, { waitUntil: 'load' });
    await page.getByRole('button', { name: /sign in/i }).waitFor({ timeout: 45_000 });
    await settle(page, 1500);
    await checkA11y(page, test.info(), 'login');
  });
});

// ---------------------------------------------------------------------------
// Authenticated surfaces + interaction states. One shared, logged-in page keeps
// the in-memory JMAP session alive; navigation between surfaces is client-side.
//
// Deliberately NOT `describe.serial`: serial mode skips every remaining test in
// the block once one fails, which would hide the a11y posture of later surfaces
// behind the first failing one. The suite still runs strictly sequentially on a
// single worker (workers: 1, fullyParallel: false), so the shared page is safe;
// each test re-establishes its own surface (returnToMail / navigate) first.
// ---------------------------------------------------------------------------
test.describe('a11y: authenticated', () => {
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
    await login(page);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('mail-list', async () => {
    await returnToMail(page);
    await checkA11y(page, test.info(), 'mail-list');
  });

  test('thread-view', async () => {
    await returnToMail(page);
    await page.getByText('GitHub Notifications').first().click();
    await settle(page, 2500);
    await checkA11y(page, test.info(), 'thread-view');
  });

  test('composer', async () => {
    await returnToMail(page);
    await page.keyboard.press('c');
    await settle(page, 2000);
    // The composer body is the TipTap editor, excluded globally in axe-helper.
    await checkA11y(page, test.info(), 'composer');
    await page.keyboard.press('Escape').catch(() => {});
    await settle(page, 800);
  });

  test('settings-main', async () => {
    await navigate(page, 'settings');
    await checkA11y(page, test.info(), 'settings-main');
  });

  test('settings-subpage', async () => {
    await navigate(page, 'settings');
    const account = page
      .getByRole('button', { name: 'Account' })
      .or(page.getByText('Account', { exact: true }));
    await account.first().click();
    await settle(page, 1500);
    await checkA11y(page, test.info(), 'settings-subpage');
  });

  test('calendar', async () => {
    await navigate(page, 'calendar');
    await checkA11y(page, test.info(), 'calendar');
  });

  test('contacts', async () => {
    await navigate(page, 'contacts');
    await checkA11y(page, test.info(), 'contacts');
  });

  // ---- Interaction states -------------------------------------------------

  test('dialog-keyboard-shortcuts', async () => {
    await returnToMail(page);
    // "?" (Shift+/) opens the keyboard-shortcuts help modal (a Radix Dialog).
    // The global shortcut ignores keys while an input is focused, so click the
    // page body first to make sure focus is not sitting in the search box, then
    // press the chord. Retry once — the shortcut hook binds after the mail view
    // has mounted, which can lag a client-side navigation.
    const dialog = page.getByRole('dialog');
    await page.locator('body').click({ position: { x: 4, y: 4 } }).catch(() => {});
    let opened = false;
    for (let attempt = 0; attempt < 2 && !opened; attempt += 1) {
      await page.keyboard.press('Shift+Slash');
      opened = await dialog
        .first()
        .waitFor({ state: 'visible', timeout: 6_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!opened) {
      // Fall back to the explicit "Keyboard shortcuts" button exposed in the UI.
      const btn = page.getByRole('button', { name: /keyboard shortcuts|shortcuts/i });
      if (await btn.count()) {
        await btn.first().click().catch(() => {});
        opened = await dialog
          .first()
          .waitFor({ state: 'visible', timeout: 6_000 })
          .then(() => true)
          .catch(() => false);
      }
    }
    test.skip(!opened, 'Keyboard-shortcuts dialog did not open in this environment.');
    await settle(page, 800);
    await checkA11y(page, test.info(), 'dialog-keyboard-shortcuts');
    await page.keyboard.press('Escape').catch(() => {});
    await settle(page, 600);
  });

  test('context-menu-email', async () => {
    await returnToMail(page);
    // Right-click a mail row to open the per-message context menu (Radix menu).
    const row = page.getByText('GitHub Notifications').first();
    await row.click({ button: 'right' });
    const menu = page.getByRole('menu');
    const opened = await menu
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!opened, 'Email context menu did not open in this environment.');
    await settle(page, 500);
    await checkA11y(page, test.info(), 'context-menu-email');
    await page.keyboard.press('Escape').catch(() => {});
    await settle(page, 400);
  });
});

/**
 * Return to the mailbox using in-app navigation. Mirrors the visual suite's
 * helper so both suites reach the mail list the same way.
 */
async function returnToMail(page: Page): Promise<void> {
  const url = new URL(page.url());
  if (url.pathname === '/' || url.pathname === '/en' || url.pathname.endsWith('/en/')) {
    return;
  }
  const mailLink = page.locator('a[href="/"], a[href="/en"]').first();
  if (await mailLink.count()) {
    await mailLink.click().catch(() => {});
    await settle(page, 2500);
    if (!page.url().includes('/login')) {
      await dismissTour(page);
      return;
    }
  }
  await login(page);
}
