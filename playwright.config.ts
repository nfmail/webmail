import { defineConfig } from '@playwright/test';

const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || 'npm run dev -- --port 3100';

export default defineConfig({
  testDir: './e2e',
  // The visual regression and a11y suites have their own configs
  // (playwright.visual.config.ts, playwright.a11y.config.ts) with their own
  // projects and mock-backed servers; keep both out of the default smoke run.
  testIgnore: ['**/visual/**', '**/a11y/**'],
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3100',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: webServerCommand,
    env: {
      ADMIN_CONFIG_DIR: 'e2e/fixtures/admin',
      ADMIN_CONFIG_READONLY: 'true',
    },
    port: 3100,
    reuseExistingServer: false,
  },
});
