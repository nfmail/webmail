import { defineConfig } from '@playwright/test';

const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || 'npm run dev -- --port 3100';

export default defineConfig({
  testDir: './e2e',
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
