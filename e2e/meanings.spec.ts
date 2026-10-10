import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'Europe/Rome', locale: 'it-IT' });

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

/** Red roses only: a 2D bouquet, quick to draw, whose meaning is known. */
async function openWithRedRoses(page: Page, isoLocal: string) {
  await page.addInitScript(() => {
    localStorage.setItem('daily-smile:prefs:v1', JSON.stringify({ flowers: ['rosa'], colors: ['rosso'] }));
  });
  await page.clock.setFixedTime(new Date(isoLocal));
  await page.goto('/');
  await expect(page.locator('#stage canvas')).toBeVisible({ timeout: 30_000 });
}

test('from Today the language of flowers shows what today’s bouquet means, then every flower', async ({ page }) => {
  await openWithRedRoses(page, '2026-10-10T22:30:00+02:00');
  await expect(page.locator('#bouquet-desc')).toHaveText('Il bouquet di oggi: rose rosse.');

  await page.getByRole('link', { name: 'Cosa significa?' }).click();
  await expect(page).toHaveURL(/#\/fiori$/);
  await expect(page.getByRole('heading', { name: 'Il linguaggio dei fiori' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fiori' })).toHaveAttribute('aria-current', 'page');

  const today = page.locator('#meanings-today');
  await expect(today.locator('.meaning-item')).toHaveCount(1);
  await expect(today.getByRole('heading', { name: 'Rose' })).toBeVisible();
  await expect(today).toContainText('La rosa è da sempre il fiore dell’amore');
  await expect(today.locator('li[data-color="rosso"]')).toHaveText('Le rose rosse sono la dichiarazione d’amore per eccellenza.');

  // The full list: every flower, closed until tapped; a sunflower is never sky blue.
  const all = page.locator('#meanings-all details');
  await expect(all).toHaveCount(8);
  const sunflowers = page.locator('#meanings-all details[data-flower="girasole"]');
  await expect(sunflowers.getByText('I girasoli gialli')).toBeHidden();
  await sunflowers.locator('summary').click();
  await expect(sunflowers.getByText('I girasoli gialli parlano di lealtà')).toBeVisible();
  await expect(sunflowers.locator('li')).toHaveCount(3);
  await expect(sunflowers.locator('li[data-color="azzurro"]')).toHaveCount(0);
  const lavender = page.locator('#meanings-all details[data-flower="lavanda"]');
  await lavender.locator('summary').click();
  await expect(lavender).toContainText('Ha sempre il suo colore naturale.');

  // Fits the phone: nothing scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // And back to Today through the tab bar.
  await page.getByRole('link', { name: 'Oggi' }).click();
  await expect(page.locator('#message')).toBeVisible();
});

test('the section follows the preferences and works by keyboard', async ({ page }) => {
  await openWithRedRoses(page, '2026-10-10T10:00:00+02:00');
  await page.getByRole('link', { name: 'Preferenze' }).click();
  await page.getByRole('button', { name: 'Bianco panna' }).click();
  await page.getByRole('button', { name: 'Rosso' }).click();
  await expect(page.locator('#pick-status')).toHaveText('Salvato ✓');
  await page.getByRole('link', { name: 'Fiori' }).click();
  await expect(page.locator('#meanings-today li[data-color="panna"]')).toHaveText('Le rose bianche parlano di purezza e di un nuovo inizio.');
  await expect(page.locator('#meanings-today li[data-color="rosso"]')).toHaveCount(0);

  const peonies = page.locator('#meanings-all details[data-flower="peonia"] summary');
  await peonies.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#meanings-all details[data-flower="peonia"]')).toHaveAttribute('open', '');
});

test.describe('on an English phone', () => {
  test.use({ locale: 'en-US' });

  test('the section speaks English', async ({ page }) => {
    await openWithRedRoses(page, '2026-10-10T08:30:00+02:00');
    await page.getByRole('link', { name: 'What does it mean?' }).click();
    await expect(page.getByRole('heading', { name: 'The language of flowers' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Today’s bouquet says…' })).toBeVisible();
    await expect(page.locator('#meanings-today li[data-color="rosso"]')).toHaveText('Red roses are the classic declaration of love.');
    await expect(page.getByRole('link', { name: 'Flowers' })).toHaveAttribute('aria-current', 'page');
    const ranunculus = page.locator('#meanings-all details[data-flower="ranuncolo"]');
    await ranunculus.locator('summary').click();
    await expect(ranunculus).toContainText('you are radiant with charm');
  });
});
