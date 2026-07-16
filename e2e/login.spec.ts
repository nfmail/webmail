import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test('loads login page', async ({ page }) => {
    await page.goto('/en/login');
    await expect(page.locator('#username')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#password')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.route('https://mail.example.test/**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'about:blank', status: 401, title: 'Unauthorized' }),
      });
    });

    await page.goto('/en/login');
    await page.locator('#username').fill('invalid@test.com');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText('Invalid email or password.', { exact: false })).toBeVisible({ timeout: 10_000 });
  });

  test.skip('logs in with valid credentials', async ({ page }) => {
    await page.goto('/');
    await page.locator('#username').fill(process.env.TEST_USER || '');
    await page.locator('#password').fill(process.env.TEST_PASS || '');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/en/, { timeout: 15000 });
  });
});
