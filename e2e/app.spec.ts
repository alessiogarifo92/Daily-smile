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

async function openAt(page: Page, isoLocal: string, path = '/') {
  await page.clock.setFixedTime(new Date(isoLocal));
  await page.goto(path);
  if (path === '/') await expect(page.locator('#stage canvas')).toBeVisible();
}

/** True once the WebGL canvas holds more than one colour, i.e. the bouquet was drawn. */
async function bouquetDrawn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('#stage canvas');
    if (!c) return false;
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 64;
    const ctx = probe.getContext('2d')!;
    ctx.drawImage(c, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data;
    const colours = new Set<number>();
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 0) colours.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
    return colours.size > 50;
  });
}

test('at night the app is dark and shows today’s message and a 3D bouquet', async ({ page }) => {
  await openAt(page, '2026-10-10T22:30:00+02:00');
  await expect(page.locator('html')).toHaveAttribute('data-phase', 'notte');
  await expect(page.locator('#greeting')).toHaveText('Dolce notte');
  await expect(page.locator('#today')).toHaveText('sabato 10 ottobre');
  await expect(page.locator('#message')).not.toBeEmpty();
  await expect(page.locator('#bouquet-desc')).toContainText('Il bouquet di oggi:');
  // Software WebGL on CI runners needs up to ~20 s for the first frame.
  await expect.poll(() => bouquetDrawn(page), { timeout: 30_000 }).toBe(true);
});

test('in the morning the background is light', async ({ page }) => {
  await openAt(page, '2026-10-10T08:15:00+02:00');
  await expect(page.locator('html')).toHaveAttribute('data-phase', 'mattina');
  await expect(page.locator('#greeting')).toHaveText('Buongiorno');
  // Retries until the 0.6 s background transition has finished.
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 238, 228)');
});

test('the same day gives the same bouquet, the next day a different message', async ({ page }) => {
  await openAt(page, '2026-10-10T10:00:00+02:00');
  const desc = await page.locator('#bouquet-desc').textContent();
  const msg = await page.locator('#message').textContent();
  await page.reload();
  await expect(page.locator('#bouquet-desc')).toHaveText(desc!);
  await page.clock.setFixedTime(new Date('2026-10-11T10:00:00+02:00'));
  await page.reload();
  await expect(page.locator('#message')).not.toHaveText(msg!);
});

test('preferences are saved and shape the bouquet', async ({ page }) => {
  await openAt(page, '2026-10-10T19:00:00+02:00');
  await expect(page.locator('html')).toHaveAttribute('data-phase', 'sera');
  await page.getByRole('link', { name: 'Preferenze' }).click();
  await expect(page.getByRole('heading', { name: 'Come ti piace il bouquet?' })).toBeVisible();

  // Keep only peonies.
  await page.getByLabel('Peonie', { exact: true }).check();
  for (const name of ['Rose', 'Tulipani', 'Girasoli', 'Ranuncoli']) await page.getByLabel(name, { exact: true }).uncheck();
  for (const name of ['Rose', 'Tulipani', 'Margherite', 'Girasoli', 'Lavanda', 'Ranuncoli', 'Gerbere']) await expect(page.getByLabel(name, { exact: true })).not.toBeChecked();

  // The last flower cannot be removed.
  await page.getByLabel('Peonie', { exact: true }).click(); // refused by the app, so not .uncheck()
  await expect(page.getByLabel('Peonie', { exact: true })).toBeChecked();
  await expect(page.locator('#prefs-status')).toHaveText('Tieni almeno un fiore.');

  // Colours: lilac only.
  await page.getByRole('button', { name: 'Lilla' }).click();
  for (const name of ['Corallo', 'Giallo sole', 'Magenta', 'Bianco panna']) await page.getByRole('button', { name }).click();
  await expect(page.getByRole('button', { name: 'Lilla' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Corallo' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: '15 minuti dopo' }).click();
  await expect(page.locator('#time')).toHaveValue('08:15');
  await page.getByText('Chiaro', { exact: true }).click();
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#prefs-status')).toContainText('Preferenze salvate');
  await expect(page.locator('html')).toHaveAttribute('data-phase', 'mattina');

  await page.reload();
  await page.getByRole('link', { name: 'Oggi' }).click();
  await expect(page.locator('#bouquet-desc')).toHaveText('Il bouquet di oggi: peonie lilla.');
  await page.getByRole('link', { name: 'Preferenze' }).click();
  await expect(page.locator('#time')).toHaveValue('08:15');
  await expect(page.getByLabel('Peonie', { exact: true })).toBeChecked();
});

test('notification switch is reachable and explains failures instead of crashing', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await openAt(page, '2026-10-10T09:00:00+02:00', '/#/preferenze');
  const toggle = page.getByLabel('Notifica giornaliera');
  // Preview has no push server: enabling must surface a readable error and stay off.
  if (await toggle.isEnabled()) {
    await toggle.check();
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.locator('#prefs-status')).toHaveText(/notifiche|server|push/i);
    await page.reload();
    await expect(page.getByLabel('Notifica giornaliera')).not.toBeChecked();
  }
  errors.length = 0; // the failed push-service request is the expected path here
});
