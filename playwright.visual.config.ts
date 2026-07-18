import { defineConfig, devices } from '@playwright/test';

/**
 * Visual-regression config, separate from the functional e2e config
 * (playwright.config.ts) so screenshot runs never mix with behavioural tests.
 *
 * Run with:  npm run test:visual
 * Update baselines (reviewed intent only):  npm run test:visual:update
 *
 * The web server boots against the built-in mock JMAP backend so login and the
 * mail/calendar/contacts surfaces render deterministic dummy data with no
 * external mail server. See e2e/visual/README.md.
 */

const PORT = 3100;
const BASE_URL = process.env.PLAYWRIGHT_VISUAL_BASE_URL || `http://localhost:${PORT}`;

const VIEWPORTS = [
  { key: 'mobile', width: 320, height: 720 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1280, height: 800 },
] as const;

const THEMES = ['light', 'dark'] as const;

export default defineConfig({
  testDir: './e2e/visual',
  testMatch: /.*\.visual\.spec\.ts/,
  timeout: 120_000,
  // Screenshots are inherently serial per shared page; keep workers modest so
  // the dev server (Turbopack) isn't overwhelmed compiling routes in parallel.
  workers: process.env.CI ? 1 : 2,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  // Baselines live in a single flat, platform-tagged folder checked into the
  // repo. Snapshots are OS-dependent; generate/refresh them on the same
  // platform CI uses (Linux).
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}-{projectName}-{platform}{ext}',

  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    },
  },

  use: {
    baseURL: BASE_URL,
    // Fixed timezone so client-side date rendering matches the mock backend's
    // pinned clock regardless of where the suite runs.
    timezoneId: 'UTC',
    contextOptions: { reducedMotion: 'reduce' },
    screenshot: 'off',
    trace: 'retain-on-failure',
  },

  projects: VIEWPORTS.flatMap((vp) =>
    THEMES.map((theme) => ({
      name: `${vp.key}-${theme}`,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      },
    })),
  ),

  webServer: {
    command: process.env.PLAYWRIGHT_VISUAL_WEB_SERVER_COMMAND || `npm run dev -- --port ${PORT}`,
    url: `${BASE_URL}/api/config`,
    env: {
      // Built-in mock JMAP backend: deterministic data, one-click dev login.
      DEV_MOCK_JMAP: 'true',
      // Pin fixture dates (and the server timezone) so date-anchored surfaces
      // don't drift between runs; e2e/visual/helpers.ts pins the browser clock
      // to the same instant. Keep in sync with FIXED_NOW in helpers.ts.
      DEV_JMAP_MOCK_NOW: '2026-07-15T13:37:00Z',
      TZ: 'UTC',
      JMAP_SERVER_URL: '/api/dev-jmap',
      SESSION_SECRET: 'visual-baseline-not-for-production',
      SETTINGS_SYNC_ENABLED: 'true',
      APP_NAME: 'NF Mail',
      LOG_LEVEL: 'warn',
    },
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
