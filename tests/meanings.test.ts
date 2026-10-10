import { describe, expect, it } from 'vitest';
import { COLOR_MEANINGS, FLOWER_MEANINGS } from '../shared/content/meanings';
import { FLOWER_COLORS, FLOWER_TYPES, REAL_COLORS, composeBouquet, isRealColor, type Bouquet, type FlowerColor, type FlowerType } from '../shared/flowers';
import { LANGS } from '../shared/i18n';
import { colorMeaning, flowerMeaning, meaningColors, todayMeanings } from '../shared/meanings';

const REAL_FLOWERS = Object.keys(REAL_COLORS) as (keyof typeof REAL_COLORS)[];
const COLOR_IDS = FLOWER_COLORS.map((c) => c.id);
const hex = (id: FlowerColor) => FLOWER_COLORS.find((c) => c.id === id)!.hex;

/** A real, non-empty sentence: no placeholder, ends with punctuation. */
function expectSentence(text: string | null | undefined): void {
  expect(text).toBeTypeOf('string');
  expect(text!.trim().length).toBeGreaterThan(20);
  expect(text).toMatch(/[.!?…]$/);
  expect(text).not.toMatch(/TODO|\{|\}/);
}

describe('language of flowers content', () => {
  it('has a meaning for every flower in both languages', () => {
    for (const f of FLOWER_TYPES) for (const lang of LANGS) expectSentence(flowerMeaning(f.id, lang));
  });

  it('has a meaning for every realistic flower × colour combination in both languages', () => {
    let combos = 0;
    for (const type of REAL_FLOWERS) {
      for (const color of REAL_COLORS[type]) {
        for (const lang of LANGS) expectSentence(colorMeaning(type, color, lang));
        combos++;
      }
    }
    expect(combos).toBe(44);
  });

  it('has no meaning for colours a flower does not come in', () => {
    for (const type of REAL_FLOWERS) {
      expect(Object.keys(COLOR_MEANINGS[type]).sort()).toEqual([...REAL_COLORS[type]].sort());
      for (const color of COLOR_IDS) {
        if (!isRealColor(type, color)) for (const lang of LANGS) expect(colorMeaning(type, color, lang)).toBeNull();
      }
    }
    expect(colorMeaning('girasole', 'azzurro', 'it')).toBeNull();
    expect(colorMeaning('rosa', 'azzurro', 'en')).toBeNull();
  });

  it('lavender keeps its natural colour, so it has no colour meanings', () => {
    for (const color of COLOR_IDS) expect(colorMeaning('lavanda', color, 'it')).toBeNull();
    expect(meaningColors('lavanda')).toEqual([]);
  });

  it('never repeats a sentence within a language, and the two languages differ', () => {
    for (const lang of LANGS) {
      const all = [
        ...Object.values(FLOWER_MEANINGS).map((m) => m[lang]),
        ...REAL_FLOWERS.flatMap((type) => Object.values(COLOR_MEANINGS[type]).map((m) => m![lang])),
      ];
      expect(new Set(all).size).toBe(all.length);
    }
    for (const f of FLOWER_TYPES) expect(flowerMeaning(f.id, 'it')).not.toBe(flowerMeaning(f.id, 'en'));
  });

  it('lists the colours with a meaning in palette order', () => {
    expect(meaningColors('girasole')).toEqual(['corallo', 'sole', 'rosso']);
    expect(meaningColors('rosa')).toHaveLength(8);
    expect(meaningColors('rosa')).not.toContain('azzurro');
  });
});

describe('today’s meanings', () => {
  const stem = (type: FlowerType, color: string) => ({ type, color, azimuth: 0, elevation: 0, scale: 1, seed: 0 });

  it('lists featured flowers first, each with the colours it wears, once, in order', () => {
    const bouquet: Pick<Bouquet, 'featured' | 'stems'> = {
      featured: [{ type: 'tulipano', color: 'corallo' }, { type: 'rosa', color: 'rosso' }],
      stems: [stem('rosa', hex('rosso')), stem('tulipano', hex('corallo')), stem('rosa', hex('panna').toLowerCase()), stem('rosa', hex('rosso'))],
    };
    expect(todayMeanings(bouquet)).toEqual([
      { type: 'tulipano', colors: ['corallo'] },
      { type: 'rosa', colors: ['rosso', 'panna'] },
    ]);
  });

  it('keeps a flower whose colour has no meaning, and lavender, without colours', () => {
    const bouquet = {
      featured: [{ type: 'rosa' as const, color: 'azzurro' as const }, { type: 'lavanda' as const, color: null }],
      stems: [stem('rosa', hex('azzurro')), stem('lavanda', '#8E7CC3'), stem('rosa', '#123456')],
    };
    expect(todayMeanings(bouquet)).toEqual([
      { type: 'rosa', colors: [] },
      { type: 'lavanda', colors: [] },
    ]);
  });

  it('adds a stem kind missing from the featured list', () => {
    expect(todayMeanings({ featured: [], stems: [stem('gerbera', hex('sole'))] })).toEqual([{ type: 'gerbera', colors: ['sole'] }]);
  });

  it('covers every kind of a real composed bouquet, with realistic colours only', () => {
    for (const day of ['2026-10-10', '2026-10-11', '2026-12-25']) {
      const bouquet = composeBouquet({ flowers: FLOWER_TYPES.map((f) => f.id), colors: COLOR_IDS, realistic: true }, day);
      const today = todayMeanings(bouquet);
      expect(today.map((m) => m.type)).toEqual(bouquet.featured.map((f) => f.type));
      for (const m of today) for (const c of m.colors) expect(isRealColor(m.type, c)).toBe(true);
    }
  });
});
