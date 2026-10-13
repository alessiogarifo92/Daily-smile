import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'Europe/Rome', locale: 'it-IT' });

const PHASES = {
  mattina: '2026-10-13T08:30:00+02:00',
  pomeriggio: '2026-10-13T15:00:00+02:00',
  sera: '2026-10-13T19:30:00+02:00',
  notte: '2026-10-13T22:30:00+02:00',
};

/** Relative luminance of a computed CSS colour: rgb()/rgba() in 0..255 or color(srgb …) in 0..1. */
function luminance(css: string): number {
  const srgb = css.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
  const rgb = css.match(/rgba?\((\d+), (\d+), (\d+)/);
  const parts = srgb ? srgb.slice(1, 4).map(Number) : rgb ? rgb.slice(1, 4).map((v) => Number(v) / 255) : null;
  if (!parts) throw new Error(`Unparsed colour: ${css}`);
  const [r, g, b] = parts.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The switch's outline (inset box-shadow colour) and the page background it sits on. */
async function switchColours(page: Page, checked: boolean) {
  const sw = page.locator('#realistic');
  await sw.setChecked(checked);
  return sw.evaluate((el) => {
    el.getAnimations().forEach((a) => a.finish()); // read the end state, not a colour mid-transition
    const shadow = getComputedStyle(el).boxShadow;
    const ring = shadow.match(/(color\([^)]*\)|rgba?\([^)]*\))/)?.[1] ?? '';
    // #realistic lives in a fieldset on the page background.
    return { ring, ground: getComputedStyle(document.body).backgroundColor };
  });
}

for (const [phase, at] of Object.entries(PHASES)) {
  test(`switch outline reaches 3:1 against its ground in the ${phase}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(at));
    await page.goto('/#/preferenze');
    await expect(page.locator('html')).toHaveAttribute('data-phase', phase);
    for (const checked of [false, true]) {
      const { ring, ground } = await switchColours(page, checked);
      expect(contrast(ring, ground), `${checked ? 'on' : 'off'}: ${ring} on ${ground}`).toBeGreaterThanOrEqual(3);
    }
  });
}

test('controls are not text-selectable, the message is', async ({ page }) => {
  await page.clock.setFixedTime(new Date(PHASES.notte));
  await page.goto('/');
  const userSelect = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).userSelect);
  for (const control of ['.tabs a', '#share', '.meaning-link']) expect(await userSelect(control), control).toBe('none');
  expect(await userSelect('#message')).not.toBe('none');
  expect(await page.locator('html').evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe('none');
  await page.goto('/#/preferenze');
  for (const control of ['.primary', '.round-btn', '.segmented span', '.flower-card', '.swatch']) {
    expect(await userSelect(control), control).toBe('none');
    expect(await page.locator(control).first().evaluate((el) => getComputedStyle(el).touchAction), control).toBe('manipulation');
  }
});

test('pressing a button gives feedback', async ({ page }) => {
  await page.clock.setFixedTime(new Date(PHASES.notte));
  await page.goto('/#/preferenze');
  const plus = page.locator('#time-plus');
  const box = (await plus.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => plus.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
  await page.mouse.up();
});
