import { expect, test } from '@playwright/test';

test.use({ baseURL: 'http://localhost:3001' });

test.describe('WebSocketProvider', () => {
  test('exposes the socket to consumers without a parent re-render', async ({ page }) => {
    await page.goto('/provider');

    await expect(page.locator('#socket')).not.toHaveText('none');
    await expect(page.locator('#message')).toContainText('Welcome to the chat!');
  });

  test('keeps the same socket when re-rendered with an inline protocols array', async ({
    page,
  }) => {
    await page.goto('/provider');
    await expect(page.locator('#socket')).not.toHaveText('none');
    const before = (await page.locator('#socket').textContent()) ?? '';

    const button = page.getByRole('button', { name: /^Re-render/ });
    for (let i = 0; i < 3; i++) await button.click();
    await expect(button).toContainText('(3)');

    await expect(page.locator('#socket')).toHaveText(before);
  });
});
