import { describe, expect, it } from 'vitest';
import { chroma, deltaE, hexToLab } from '../shared/color';
import { FLOWER_COLORS, FLOWER_TYPES, MIN_RIBBON_DELTA, MIN_WRAP_DELTA, WRAPS, colorHex, composeBouquet, type FlowerColor, type FlowerType } from '../shared/flowers';

describe('colour distance', () => {
  it('converts sRGB hex to CIE Lab', () => {
    expect(hexToLab('#FFFFFF').map((v) => Math.round(v) + 0)).toEqual([100, 0, 0]);
    expect(hexToLab('#000000').map((v) => Math.round(v) + 0)).toEqual([0, 0, 0]);
    const [l, a, b] = hexToLab('#FF0000');
    expect(Math.round(l)).toBe(53);
    expect(a).toBeGreaterThan(75);
    expect(b).toBeGreaterThan(60);
  });
  it('accepts lower case and rejects malformed colours', () => {
    expect(hexToLab('#ff7a59')).toEqual(hexToLab('#FF7A59'));
    expect(() => hexToLab('FF7A59')).toThrow();
    expect(() => hexToLab('#FFF')).toThrow();
    expect(() => hexToLab('#GGGGGG')).toThrow();
  });
  it('measures distance and saturation', () => {
    expect(deltaE('#FF7A59', '#FF7A59')).toBe(0);
    expect(deltaE('#FFFFFF', '#000000')).toBeCloseTo(100, 0);
    expect(deltaE('#FFF6E5', '#F3E6D3')).toBeLessThan(MIN_WRAP_DELTA); // cream on cream paper
    expect(chroma('#808080')).toBeLessThan(1);
    expect(chroma('#E0457B')).toBeGreaterThan(chroma('#FFF6E5'));
  });
});

/** Every day of a year, so each style of the rotation comes round many times. */
const DAYS = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

const SELECTIONS: { flowers: FlowerType[]; colors: FlowerColor[]; realistic?: boolean }[] = [
  { flowers: ['tulipano', 'girasole', 'ranuncolo', 'rosa'], colors: ['corallo', 'sole', 'magenta', 'panna'], realistic: true },
  { flowers: ['rosa'], colors: ['panna'] },
  { flowers: ['rosa', 'tulipano'], colors: ['panna', 'cipria', 'pesca'] },
  { flowers: ['margherita', 'lavanda'], colors: ['panna'] },
  { flowers: FLOWER_TYPES.map((f) => f.id), colors: FLOWER_COLORS.map((c) => c.id) },
];

/** Smallest distance between the paper and any flower of the bouquet. */
const wrapGap = (wrap: string, colors: string[]) => Math.min(...colors.map((c) => deltaE(wrap, c)));

describe('bouquet wrap and ribbon contrast', () => {
  it('the paper stands apart from the flowers whenever one of the papers can', () => {
    for (const prefs of SELECTIONS) {
      for (const day of DAYS) {
        const b = composeBouquet(prefs, day);
        const colors = b.stems.map((s) => s.color);
        expect(WRAPS).toContain(b.wrap);
        const best = Math.max(...WRAPS.map((w) => wrapGap(w, colors)));
        if (best >= MIN_WRAP_DELTA) expect(wrapGap(b.wrap, colors)).toBeGreaterThanOrEqual(MIN_WRAP_DELTA);
        else expect(wrapGap(b.wrap, colors)).toBe(best);
      }
    }
  });
  it('a cream bouquet never sits on cream paper', () => {
    for (const day of DAYS) {
      const b = composeBouquet({ flowers: ['rosa'], colors: ['panna'] }, day);
      expect(b.wrap).not.toBe('#F3E6D3');
    }
  });
  it('the ribbon is always a palette colour that stands out from the paper when possible', () => {
    const palette = new Set<string>(FLOWER_COLORS.map((c) => c.hex));
    for (const prefs of SELECTIONS) {
      const chosen = prefs.colors.map(colorHex);
      for (const day of DAYS) {
        const b = composeBouquet(prefs, day);
        expect(palette.has(b.ribbon)).toBe(true);
        const canStandOut = [...chosen, colorHex('corallo')].some((c) => deltaE(c, b.wrap) >= MIN_RIBBON_DELTA);
        if (canStandOut) expect(deltaE(b.ribbon, b.wrap)).toBeGreaterThanOrEqual(MIN_RIBBON_DELTA);
      }
    }
  });
  it('a cream-only selection gets a coral ribbon', () => {
    for (const day of DAYS.slice(0, 60)) {
      expect(composeBouquet({ flowers: ['rosa', 'tulipano'], colors: ['panna'] }, day).ribbon).toBe(colorHex('corallo'));
    }
  });
  it('a light day borrows the ribbon from a saturated chosen colour', () => {
    // Defaults: some days are cream only, the ribbon then comes from corallo, sole or magenta.
    const saturated = new Set(['corallo', 'sole', 'magenta'].map((c) => colorHex(c as FlowerColor)));
    const prefs = SELECTIONS[0]!;
    const creamDays = DAYS.map((d) => composeBouquet(prefs, d)).filter((b) => b.stems.every((s) => s.color === colorHex('panna')));
    expect(creamDays.length).toBeGreaterThan(0);
    for (const b of creamDays) expect(saturated.has(b.ribbon)).toBe(true);
  });
  it('keeps the ribbon of a saturated day', () => {
    for (const day of DAYS.slice(0, 60)) {
      expect(composeBouquet({ flowers: ['rosa'], colors: ['rosso'] }, day).ribbon).toBe(colorHex('rosso'));
    }
  });
  it('stays deterministic', () => {
    const prefs = SELECTIONS[0]!;
    expect(composeBouquet(prefs, '2026-10-13')).toEqual(composeBouquet(prefs, '2026-10-13'));
  });
});
