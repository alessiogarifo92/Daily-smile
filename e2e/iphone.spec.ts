import { devices, expect, test } from '@playwright/test';

// iPhone viewport, touch and Safari user agent. The engine is still Chromium (no WebKit in CI),
// so this covers layout and the iOS-specific branches of our code, not Safari's rendering itself.
const { defaultBrowserType: _engine, ...iPhone13 } = devices['iPhone 13'];
// Playwright's profile ships an old iOS user agent; Web Push needs 16.4, so run the main tests on iOS 18.
const iPhone = { ...iPhone13, userAgent: iPhone13.userAgent.replace(/OS \d+_\d+(_\d+)?/, 'OS 18_0').replace(/Version\/[\d.]+/, 'Version/18.0') };
test.use({ ...iPhone, timezoneId: 'Europe/Rome', locale: 'it-IT' });

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

async function noSideScroll(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('Safari tab on iPhone: today view fits and the bouquet is drawn', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#message')).not.toBeEmpty();
  await expect(page.locator('#stage canvas, #stage img').first()).toBeVisible({ timeout: 30_000 });
  await noSideScroll(page);
});

test('Safari tab on iPhone: notifications explain Add to Home Screen', async ({ page }) => {
  await page.goto('/#/preferenze');
  await expect(page.locator('#push-hint')).toBeVisible();
  await expect(page.locator('#push-hint')).toContainText('Aggiungi alla schermata Home');
  await expect(page.locator('#notifications')).toBeDisabled();
  await noSideScroll(page);
});

test('Home Screen app on iPhone: the notification switch is available', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.goto('/#/preferenze');
  await expect(page.locator('#notifications')).toBeEnabled();
  await expect(page.locator('#push-hint')).toBeHidden();
});

test('Home Screen icon is a 180px opaque PNG (iOS paints transparent corners black)', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  const png = await res.body();
  // IHDR: width, height at bytes 16-23, colour type at 25 (2 = RGB, no alpha channel).
  expect(png.readUInt32BE(16)).toBe(180);
  expect(png.readUInt32BE(20)).toBe(180);
  expect(png[25]).toBe(2);
});

test('manifest makes the Home Screen app standalone', async ({ page }) => {
  const res = await page.request.get('/manifest.webmanifest');
  const manifest = await res.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
});

test('Home Screen app opens offline from its very first launch', async ({ page, context }) => {
  // On iPhone the Home Screen app does not share Safari's storage, so its first launch is a first visit.
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#message')).not.toBeEmpty({ timeout: 15_000 });
  await context.setOffline(false);
  // Flower sprites and the 3D module load on demand and were never fetched online: failing offline is
  // expected. Only network failures are dropped; any other console error still fails the test.
  const offline = /net::ERR_(FAILED|INTERNET_DISCONNECTED)|Failed to fetch dynamically imported module/;
  for (let i = errors.length - 1; i >= 0; i--) if (offline.test(errors[i]!)) errors.splice(i, 1);
});

test.describe('iPhone on iOS 15', () => {
  test.use({ userAgent: iPhone.userAgent.replace(/OS \d+_\d+/, 'OS 15_8') });
  test('notifications explain that iOS must be updated', async ({ page }) => {
    await page.goto('/#/preferenze');
    await expect(page.locator('#push-hint')).toContainText('iOS 16.4');
    await expect(page.locator('#notifications')).toBeDisabled();
  });
});
