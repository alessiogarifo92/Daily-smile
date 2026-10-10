import { COLOR_MEANINGS, FLOWER_MEANINGS } from './content/meanings';
import { FLOWER_COLORS, type Bouquet, type FlowerColor, type FlowerType } from './flowers';
import type { Lang } from './i18n';

export function flowerMeaning(type: FlowerType, lang: Lang): string {
  return FLOWER_MEANINGS[type][lang];
}

/** What this colour says on this flower; null when the flower doesn't come in it (or is lavender). */
export function colorMeaning(type: FlowerType, color: FlowerColor, lang: Lang): string | null {
  if (type === 'lavanda') return null;
  return COLOR_MEANINGS[type][color]?.[lang] ?? null;
}

/** Colours that have a meaning on this flower, in the app's palette order. */
export function meaningColors(type: FlowerType): FlowerColor[] {
  return FLOWER_COLORS.map((c) => c.id).filter((c) => colorMeaning(type, c, 'it') !== null);
}

export interface TodayMeaning {
  type: FlowerType;
  /** Colours this flower wears in today's bouquet that have a meaning, in order of appearance. */
  colors: FlowerColor[];
}

/**
 * Flowers of a bouquet with the colours they wear, featured kinds first. A colour without a
 * meaning on that flower (realistic colours off: a sky-blue rose) is left out; the flower stays.
 */
export function todayMeanings(bouquet: Pick<Bouquet, 'featured' | 'stems'>): TodayMeaning[] {
  const out = new Map<FlowerType, FlowerColor[]>();
  for (const { type } of bouquet.featured) out.set(type, []);
  for (const stem of bouquet.stems) {
    const colors = out.get(stem.type) ?? [];
    out.set(stem.type, colors);
    const id = FLOWER_COLORS.find((c) => c.hex.toLowerCase() === stem.color.toLowerCase())?.id;
    if (id && !colors.includes(id) && colorMeaning(stem.type, id, 'it') !== null) colors.push(id);
  }
  return [...out.entries()].map(([type, colors]) => ({ type, colors }));
}
