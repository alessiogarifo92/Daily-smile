import { expect, test, type Page } from '@playwright/test';
import { FLOWER_COLORS, FLOWER_TYPES } from '../shared/flowers';

// Renders single-colour bouquets and measures what the petals really look like on screen.
test.use({ timezoneId: 'Europe/Rome', locale: 'it-IT' });

type RGB = [number, number, number];
const hexToRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;

function toLab([r, g, b]: RGB): [number, number, number] {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function deltaE(a: RGB, b: RGB): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Median petal colour: top part of the bouquet, without background and green stems/leaves. */
async function petalColour(page: Page, flower: string, color: string, skipHeart = false): Promise<RGB> {
  await page.addInitScript(([f, c]) => {
    localStorage.setItem('daily-smile:prefs:v1', JSON.stringify({ flowers: [f], colors: [c], theme: 'chiaro' }));
  }, [flower, color]);
  await page.clock.setFixedTime(new Date('2026-10-10T10:00:00+02:00'));
  await page.goto('/');
  await page.locator('#stage canvas').waitFor();
  await page.waitForTimeout(4000); // entrance animation
  return page.evaluate((skip) => {
    const c = document.querySelector<HTMLCanvasElement>('#stage canvas')!;
    const w = 160;
    const h = Math.round((c.height / c.width) * w);
    const probe = document.createElement('canvas');
    probe.width = w;
    probe.height = h;
    const ctx = probe.getContext('2d')!;
    ctx.drawImage(c, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, Math.round(h * 0.5)).data;
    const px: [number, number, number][] = [];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]! < 250) continue; // transparent: page background
      const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
      if (g > r + 8 && g > b) continue; // stems and leaves
      // Daisy / gerbera / sunflower hearts: golden yellow or dark brown discs, not petals.
      if (skip && ((r > 150 && g > 110 && b < 90 && g > b + 40) || r + g + b < 150)) continue;
      px.push([r, g, b]);
    }
    const med = (k: 0 | 1 | 2) => px.map((p) => p[k]).sort((a, b) => a - b)[Math.floor(px.length / 2)] ?? 0;
    return [med(0), med(1), med(2)] as [number, number, number];
  }, skipHeart);
}

for (const c of FLOWER_COLORS) {
  test(`roses in ${c.label} look ${c.label}`, async ({ page }) => {
    const got = await petalColour(page, 'rosa', c.id);
    const target = hexToRgb(c.hex);
    const dE = deltaE(got, target);
    console.log(`${c.id.padEnd(8)} target ${c.hex} got rgb(${got.join(',')}) ΔE ${dE.toFixed(1)}`);
    // Closer to the chosen colour than to any other colour of the palette, and close in absolute terms.
    const nearest = [...FLOWER_COLORS].sort((a, b) => deltaE(got, hexToRgb(a.hex)) - deltaE(got, hexToRgb(b.hex)))[0]!;
    expect(nearest.id, `${c.id} rendered rgb(${got.join(',')}) reads as ${nearest.id}`).toBe(c.id);
    expect(dE, `${c.id}: rendered rgb(${got.join(',')}) vs ${c.hex}`).toBeLessThan(25);
  });
}

for (const f of FLOWER_TYPES.filter((x) => x.id !== 'lavanda')) {
  test(`${f.label} in red look red`, async ({ page }) => {
    const got = await petalColour(page, f.id, 'rosso', ['margherita', 'gerbera', 'girasole'].includes(f.id));
    const dE = deltaE(got, hexToRgb('#C0283C'));
    console.log(`${f.id.padEnd(10)} red got rgb(${got.join(',')}) ΔE ${dE.toFixed(1)}`);
    const nearest = [...FLOWER_COLORS].sort((a, b) => deltaE(got, hexToRgb(a.hex)) - deltaE(got, hexToRgb(b.hex)))[0]!;
    expect(nearest.id, `${f.id} in red rendered rgb(${got.join(',')}) reads as ${nearest.id}`).toBe('rosso');
    expect(dE, `${f.id}: rendered rgb(${got.join(',')})`).toBeLessThan(25);
  });
}
