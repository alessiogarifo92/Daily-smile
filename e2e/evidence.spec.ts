import { test } from '@playwright/test';

// Screenshots for the ticket's "Test info" record. Run with: EVIDENCE=1 npx playwright test e2e/evidence.spec.ts
test.skip(!process.env.EVIDENCE, 'evidence screenshots only on request');
test.use({ timezoneId: 'Europe/Rome', locale: 'it-IT' });

const out = process.env.EVIDENCE_DIR || 'docs/test-evidence/mvp';
const shots: [string, string, string][] = [
  ['01-notte', '2026-10-10T22:30:00+02:00', '/'],
  ['02-mattina', '2026-10-11T08:10:00+02:00', '/'],
  ['03-pomeriggio', '2026-10-12T15:00:00+02:00', '/'],
  ['04-sera', '2026-10-13T19:30:00+02:00', '/'],
  ['05-preferenze', '2026-10-10T22:30:00+02:00', '/#/preferenze'],
];

for (const [name, at, path] of shots) {
  test(name, async ({ page }) => {
    await page.clock.setFixedTime(new Date(at));
    await page.goto(path);
    await page.waitForTimeout(path === '/' ? 6000 : 500); // let the bouquet finish blooming
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: path !== '/' });
  });
}
