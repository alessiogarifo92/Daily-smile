import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'Europe/Rome', locale: 'it-IT' });
// Every test except the English one below runs on an Italian phone.

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
  if (path === '/') await expect(page.locator('#stage canvas')).toBeVisible({ timeout: 30_000 }); // the 3D code is downloaded on demand
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
  await expect(page.locator('#pick-status')).toHaveText('Tieni almeno un fiore.');

  // Colours: lilac only.
  await page.getByRole('button', { name: 'Lilla' }).click();
  for (const name of ['Corallo', 'Giallo sole', 'Magenta', 'Bianco panna']) await page.getByRole('button', { name }).click();
  await expect(page.getByRole('button', { name: 'Lilla' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Corallo' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: '15 minuti dopo' }).click();
  await expect(page.locator('#time-h')).toHaveValue('08');
  await expect(page.locator('#time-m')).toHaveValue('15');
  await page.getByText('Chiaro', { exact: true }).click();
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#prefs-status')).toContainText('Preferenze salvate');
  await expect(page.locator('html')).toHaveAttribute('data-phase', 'mattina');

  await page.reload();
  await page.getByRole('link', { name: 'Oggi' }).click();
  // Light theme forced at 19:00: the background is light, the greeting still follows the clock.
  await expect(page.locator('#greeting')).toHaveText('Buonasera');
  await expect(page.locator('#bouquet-desc')).toHaveText('Il bouquet di oggi: peonie lilla.');
  await page.getByRole('link', { name: 'Preferenze' }).click();
  await expect(page.locator('#time-h')).toHaveValue('08');
  await expect(page.locator('#time-m')).toHaveValue('15');
  await expect(page.getByLabel('Peonie', { exact: true })).toBeChecked();
});

test('flowers and colours save on their own and the preview follows, with realistic colours', async ({ page }) => {
  await openAt(page, '2026-10-10T10:00:00+02:00', '/#/preferenze');
  await expect(page.getByLabel('Colori realistici')).toBeChecked();
  // Only sunflowers, in cream and red: with realistic colours the sunflowers come out red.
  await page.getByLabel('Girasoli', { exact: true }).check();
  for (const name of ['Rose', 'Tulipani', 'Ranuncoli']) await page.getByLabel(name, { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Rosso' }).click();
  for (const name of ['Corallo', 'Giallo sole', 'Magenta']) await page.getByRole('button', { name }).click();
  await expect(page.locator('#pick-status')).toHaveText('Salvato ✓');
  await expect(page.locator('#prefs-preview')).toHaveText('Anteprima di oggi: girasoli rossi.');
  // Colour names are on screen, not only in the accessible label.
  await expect(page.locator('.swatch-name', { hasText: 'Bianco panna' })).toBeVisible();

  // Realism off: the user's cream is allowed again on some day, and the choice is kept.
  await page.getByLabel('Colori realistici').uncheck();
  await page.reload();
  await expect(page.getByLabel('Colori realistici')).not.toBeChecked();
  await expect(page.getByLabel('Girasoli', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Rose', { exact: true })).not.toBeChecked();
  // No Save pressed, yet Today shows the new bouquet.
  await page.getByRole('link', { name: 'Oggi' }).click();
  await expect(page.locator('#bouquet-desc')).toContainText('girasoli');
  await expect(page.locator('#bouquet-desc')).not.toContainText('rose');
});

test('flower style: realistic flowers in 2D, 3D on request, every flower in 2D', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('daily-smile:prefs:v1', JSON.stringify({ flowers: ['rosa'], colors: ['rosso', 'panna'] }));
  });
  await openAt(page, '2026-10-10T10:00:00+02:00');
  const stage = page.locator('#stage');
  await expect(stage).toHaveAttribute('data-renderer', '2d');
  await expect(stage.locator('canvas')).toHaveCount(1);

  // Switch to 3D in Preferences: no reload, the Today tab redraws in 3D.
  await page.getByRole('link', { name: 'Preferenze' }).click();
  await expect(page.getByLabel('Realistico')).toBeChecked();
  await page.getByText('3D interattivo', { exact: true }).click();
  await expect(page.locator('#pick-status')).toHaveText('Salvato ✓');
  await page.getByRole('link', { name: 'Oggi' }).click();
  await expect(stage).toHaveAttribute('data-renderer', '3d', { timeout: 30_000 });
  await expect(stage.locator('canvas')).toHaveCount(1);

  // Back to realistic, then add gerberas and peonies: every flower has sprites, so it stays in 2D
  // (the 3D fallback for a stem without sprites is covered by the unit tests).
  await page.getByRole('link', { name: 'Preferenze' }).click();
  await page.getByText('Realistico', { exact: true }).click();
  await page.getByRole('link', { name: 'Oggi' }).click();
  await expect(stage).toHaveAttribute('data-renderer', '2d');
  await page.getByRole('link', { name: 'Preferenze' }).click();
  await page.getByLabel('Gerbere', { exact: true }).check();
  await page.getByLabel('Peonie', { exact: true }).check();
  await page.getByLabel('Rose', { exact: true }).uncheck();
  await page.getByRole('link', { name: 'Oggi' }).click();
  await expect(stage).toHaveAttribute('data-renderer', '2d', { timeout: 30_000 });
});

test('notification switch is reachable and explains failures instead of crashing', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await openAt(page, '2026-10-10T09:00:00+02:00', '/#/preferenze');
  const toggle = page.getByLabel('Notifica giornaliera');
  // Preview has no push server: enabling must surface a readable error and stay off.
  if (await toggle.isEnabled()) {
    await toggle.check();
    await page.getByRole('button', { name: 'Salva' }).click();
    // First save waits for the service worker to install: allow for it.
    await expect(page.locator('#prefs-status')).toHaveText(/notifiche|server|push/i, { timeout: 15_000 });
    await page.reload();
    await expect(page.getByLabel('Notifica giornaliera')).not.toBeChecked();
  }
  errors.length = 0; // the failed push-service request is the expected path here
});

test('the time is typed on the numeric keypad, in 24h, and out-of-range values are fixed', async ({ page }) => {
  await openAt(page, '2026-10-10T09:00:00+02:00', '/#/preferenze');
  const hours = page.getByRole('textbox', { name: 'Ore' });
  const minutes = page.getByRole('textbox', { name: 'Minuti' });
  await expect(hours).toHaveAttribute('inputmode', 'numeric');
  await expect(minutes).toHaveAttribute('inputmode', 'numeric');
  await hours.click();
  await page.keyboard.type('21'); // two digits: focus jumps to the minutes
  await expect(minutes).toBeFocused();
  await page.keyboard.type('7');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#prefs-status')).toContainText('Preferenze salvate');
  await expect(hours).toHaveValue('21');
  await expect(minutes).toHaveValue('07');
  await hours.fill('29');
  await minutes.fill('x9');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(hours).toHaveValue('23');
  await expect(minutes).toHaveValue('09');
  await minutes.fill('');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#prefs-status')).toHaveText('Scegli un orario valido.');
});

test.describe('on an English phone', () => {
  test.use({ locale: 'en-US' });

  test('the app speaks English, and the language can be switched in Preferences', async ({ page }) => {
    await openAt(page, '2026-10-10T08:30:00+02:00');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#greeting')).toHaveText('Good morning');
    await expect(page.locator('#today')).toHaveText('Saturday 10 October');
    await expect(page.locator('#bouquet-desc')).toContainText('Today’s bouquet:');
    await expect(page.getByRole('link', { name: 'Preferences' })).toBeVisible();

    await page.getByRole('link', { name: 'Preferences' }).click();
    await expect(page.getByRole('heading', { name: 'How do you like your bouquet?' })).toBeVisible();
    await expect(page.getByLabel('Sunflowers', { exact: true })).toBeVisible();
    await page.getByText('Italiano', { exact: true }).click(); // applies and saves at once
    await expect(page.locator('#pick-status')).toHaveText('Salvato ✓');
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(page.getByRole('button', { name: 'Salva' })).toBeVisible();

    await page.reload();
    await expect(page.locator('#greeting')).toHaveText('Buongiorno');
  });
});

test('the gift changes at midnight, also before the notification time', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('daily-smile:prefs:v1', JSON.stringify({ notifications: true, time: '18:30' }));
  });
  await openAt(page, '2026-10-10T15:40:00+02:00');
  await expect(page.locator('#today')).toHaveText('sabato 10 ottobre');
  await expect(page.locator('#card-title')).toHaveText('Per te · sabato 10 ottobre');
  await expect(page.locator('#next')).toHaveText('Promemoria ogni giorno alle 18:30');
  const before = await page.locator('#message').textContent();

  // Just after midnight the new day's gift is on display, hours before the notification.
  await page.clock.setFixedTime(new Date('2026-10-11T00:01:00+02:00'));
  await page.reload();
  await expect(page.locator('#card-title')).toHaveText('Per te · domenica 11 ottobre');
  await expect(page.locator('#message')).not.toHaveText(before ?? '');
});
