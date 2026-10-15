import { expect, test } from '@playwright/test';

test.use({ baseURL: 'http://localhost:3004' });

test.describe('WebSocket Proxy', () => {
  test('connects through the proxy to the upstream path', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('li').first()).toHaveText(
      'Connected to upstream at /custom/path',
    );
  });

  test('forwards messages both ways', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('li').first()).toBeVisible();

    await page.fill('input[name=message]', 'hello');
    await page.click('button[type=submit]');
    await expect(page.locator('li').last()).toHaveText('Echo: hello');
  });
});
