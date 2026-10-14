import { expect, test, type Locator, type Page } from '@playwright/test';

// A common phone, no scrolling: the whole card and the notification invite sit above the tab bar.
test.use({ timezoneId: 'Europe/Rome', locale: 'it-IT', viewport: { width: 390, height: 844 } });

async function open(page: Page, prefs?: object) {
  if (prefs) await page.addInitScript((p) => localStorage.setItem('daily-smile:prefs:v1', p), JSON.stringify(prefs));
  await page.clock.setFixedTime(new Date('2026-10-13T08:30:00+02:00'));
  await page.goto('/');
  await expect(page.locator('#stage canvas')).toBeVisible({ timeout: 30_000 });
  await page.locator('.card').evaluate((el) => el.getAnimations().forEach((a) => a.finish()));
}

async function aboveTabs(page: Page, el: Locator) {
  const box = await el.boundingBox();
  const tabs = await page.locator('.tabs').boundingBox();
  expect(box, 'element on screen').not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(tabs!.y);
}

test('first screen: signature, share and the notification invite are above the tab bar', async ({ page }) => {
  await open(page);
  const invite = page.locator('#invite');
  await expect(invite).toBeVisible();
  await expect(invite).toHaveText('Ricevilo ogni giorno alle 08:00');
  await expect(invite).toHaveAttribute('href', '#/preferenze');
  await expect(page.locator('#next')).toBeHidden();
  for (const el of [page.locator('.sign'), page.locator('#share'), invite]) await aboveTabs(page, el);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await invite.click();
  await expect(page.locator('#view-preferenze')).toBeVisible();
});

test('with the notification on there is no invite, only the reminder line', async ({ page }) => {
  await open(page, { notifications: true, time: '18:30' });
  await expect(page.locator('#invite')).toBeHidden();
  await expect(page.locator('#next')).toHaveText('Promemoria ogni giorno alle 18:30');
  await aboveTabs(page, page.locator('#share'));
});
