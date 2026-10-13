import { expect, test } from '@playwright/test';

// Default project profile: Pixel 7 on Chrome. On Android, Web Push works in a normal browser tab.
test.use({ timezoneId: 'Europe/Rome', locale: 'it-IT' });

test('Android Chrome: daily notification can be switched on without installing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/preferenze');
  await expect(page.locator('#notifications')).toBeEnabled();
  await expect(page.locator('#push-hint')).toBeHidden();
  expect(await page.evaluate(() => navigator.userAgent)).toContain('Android');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
