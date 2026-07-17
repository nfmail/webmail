import { defineConfig, devices } from '@playwright/test';

/**
 * Accessibility (axe-core) config, separate from the functional smoke config
 * (playwright.config.ts, which ignores e2e/visual and e2e/a11y) and from the
 * visual-regression config (playwright.visual.config.ts). Keeping a11y in its
 * own config lets the default smoke run stay fast while the a11y scan boots the
 * mock-JMAP backend the same way the visual suite does.
 *
 * Run with:  npm run test:a11y
 *
 * The web server boots against the built-in mock JMAP backend so login and the
 * mail/calendar/contacts surfaces render deterministic dummy data with no
 * external mail server. See e2e/a11y/README.md.
 */

const PORT = 3100;
const BASE_URL = process.env.PLAYWRIGHT_A11Y_BASE_URL || `http://localhost:${PORT}`;

// Contrast findings are theme-dependent, so scan both light and dark. A single
// desktop viewport is enough for structural a11y (roles, names, landmarks); the
// visual suite owns the full viewport matrix.
const THEMES = ['light', 'dark'] as const;

export default defineConfig({
  testDir: './e2e/a11y',
  testMatch: /.*\.a11y\.spec\.ts/,
  timeout: 120_000,
  // The suite is inherently serial: the authenticated surfaces share one
  // logged-in page, and the standalone login test must not run concurrently with
  // the serial block (concurrent contexts race on the Playwright trace-artifact
  // directory). One worker keeps it deterministic on every platform.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: BASE_URL,
    contextOptions: { reducedMotion: 'reduce' },
    screenshot: 'off',
    trace: 'retain-on-failure',
  },

  projects: THEMES.map((theme) => ({
    name: `desktop-${theme}`,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1280, height: 800 },
      colorScheme: theme,
    },
  })),

  webServer: {
    command: process.env.PLAYWRIGHT_A11Y_WEB_SERVER_COMMAND || `npm run dev -- --port ${PORT}`,
    url: `${BASE_URL}/api/config`,
    env: {
      // Built-in mock JMAP backend: deterministic data, one-click dev login.
      DEV_MOCK_JMAP: 'true',
      JMAP_SERVER_URL: '/api/dev-jmap',
      SESSION_SECRET: 'a11y-scan-not-for-production',
      SETTINGS_SYNC_ENABLED: 'true',
      APP_NAME: 'NF Mail',
      LOG_LEVEL: 'warn',
    },
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
