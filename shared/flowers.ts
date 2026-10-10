import { joinList, type Lang } from './i18n';
import { createRng, hashString, pick, shuffle } from './random';

export const FLOWER_TYPES = [
  { id: 'rosa', label: 'Rose', en: 'Roses' },
  { id: 'tulipano', label: 'Tulipani', en: 'Tulips' },
  { id: 'margherita', label: 'Margherite', en: 'Daisies' },
  { id: 'girasole', label: 'Girasoli', en: 'Sunflowers' },
  { id: 'peonia', label: 'Peonie', en: 'Peonies' },
  { id: 'lavanda', label: 'Lavanda', en: 'Lavender' },
  { id: 'ranuncolo', label: 'Ranuncoli', en: 'Ranunculus' },
  { id: 'gerbera', label: 'Gerbere', en: 'Gerberas' },
] as const;

export const FLOWER_COLORS = [
  { id: 'corallo', label: 'Corallo', en: 'Coral', hex: '#FF7A59' },
  { id: 'sole', label: 'Giallo sole', en: 'Sunshine yellow', hex: '#FFC845' },
  { id: 'magenta', label: 'Magenta', en: 'Magenta', hex: '#E0457B' },
  { id: 'cipria', label: 'Rosa cipria', en: 'Powder pink', hex: '#F2B8C2' },
  { id: 'rosso', label: 'Rosso', en: 'Red', hex: '#C0283C' },
  { id: 'lilla', label: 'Lilla', en: 'Lilac', hex: '#A88BEB' },
  { id: 'pesca', label: 'Pesca', en: 'Peach', hex: '#F8B98B' },
  { id: 'panna', label: 'Bianco panna', en: 'Cream white', hex: '#FFF6E5' },
  { id: 'azzurro', label: 'Azzurro', en: 'Sky blue', hex: '#7FB5F0' },
] as const;

export type FlowerType = (typeof FLOWER_TYPES)[number]['id'];
export type FlowerColor = (typeof FLOWER_COLORS)[number]['id'];

export const DEFAULT_FLOWERS: FlowerType[] = ['tulipano', 'girasole', 'ranuncolo', 'rosa'];
export const DEFAULT_COLORS: FlowerColor[] = ['corallo', 'sole', 'magenta', 'panna'];

const TYPE_IDS = new Set<string>(FLOWER_TYPES.map((f) => f.id));
const COLOR_IDS = new Set<string>(FLOWER_COLORS.map((c) => c.id));

export function isFlowerType(v: unknown): v is FlowerType {
  return typeof v === 'string' && TYPE_IDS.has(v);
}
export function isFlowerColor(v: unknown): v is FlowerColor {
  return typeof v === 'string' && COLOR_IDS.has(v);
}

export function flowerLabel(id: FlowerType, lang: Lang): string {
  const f = FLOWER_TYPES.find((x) => x.id === id);
  return f ? (lang === 'en' ? f.en : f.label) : id;
}

export function colorLabel(id: FlowerColor, lang: Lang): string {
  const c = FLOWER_COLORS.find((x) => x.id === id);
  return c ? (lang === 'en' ? c.en : c.label) : id;
}

export function colorHex(id: FlowerColor): string {
  return FLOWER_COLORS.find((c) => c.id === id)?.hex ?? '#FF7A59';
}

/** Flowers whose real-world colour is fixed: their own palette is used, not the user's. */
const NATURAL_COLORS: Partial<Record<FlowerType, string[]>> = {
  lavanda: ['#8E7CC3', '#9D86D1', '#7E6BB5'],
};

export interface Stem {
  type: FlowerType;
  color: string;
  /** Position of the head on the bouquet dome: azimuth (rad), elevation 0 (edge) .. 1 (top). */
  azimuth: number;
  elevation: number;
  /** Relative head size, ~0.8 .. 1.2. */
  scale: number;
  /** Per-flower seed for petal jitter. */
  seed: number;
}

export interface Bouquet {
  dateKey: string;
  stems: Stem[];
  wrap: string;
  ribbon: string;
  /** Today's featured kinds and their main colour (null for flowers with a natural colour). */
  featured: { type: FlowerType; color: FlowerColor | null }[];
}

const WRAPS = ['#F3E6D3', '#E9DCEF', '#DCE8E0', '#F5DCD3'];

export interface BouquetPreferences {
  flowers: readonly FlowerType[];
  colors: readonly FlowerColor[];
}

/**
 * Deterministic bouquet for a day: same day + same preferences → same bouquet,
 * different day → a different mix. Empty preferences fall back to defaults.
 */
export function composeBouquet(prefs: BouquetPreferences, dateKey: string): Bouquet {
  const flowers = dedupe(prefs.flowers.filter(isFlowerType));
  const colors = dedupe(prefs.colors.filter(isFlowerColor));
  // Sorted, so the order the preferences were saved in never changes the result.
  const types = [...(flowers.length > 0 ? flowers : DEFAULT_FLOWERS)].sort();
  const palette = [...(colors.length > 0 ? colors : DEFAULT_COLORS)].sort().map(colorHex);

  const rng = createRng(hashString(`${dateKey}|${types.join(',')}|${palette.join(',')}`));

  // Today's featured subset: 2-4 kinds (or all, when fewer were chosen).
  const kinds = shuffle(rng, types).slice(0, Math.min(types.length, 2 + Math.floor(rng() * 3)));
  const dayPalette = shuffle(rng, palette).slice(0, Math.min(palette.length, 2 + Math.floor(rng() * 2)));

  const count = 11 + Math.floor(rng() * 5); // 11..15 stems
  const kindColor = new Map<FlowerType, string>();
  kinds.forEach((k, i) => kindColor.set(k, dayPalette[i % dayPalette.length] as string));

  const stems: Stem[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const spin = rng() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const type = i < kinds.length ? (kinds[i] as FlowerType) : pick(rng, kinds);
    const natural = NATURAL_COLORS[type];
    const color = natural
      ? pick(rng, natural)
      : rng() < 0.75
        ? (kindColor.get(type) as string)
        : pick(rng, dayPalette);
    // Fibonacci spiral on the dome: the first stems sit near the top.
    const t = (i + 0.5) / count;
    stems.push({
      type,
      color,
      azimuth: spin + i * golden,
      elevation: 1 - Math.sqrt(t),
      scale: 0.85 + rng() * 0.3,
      seed: Math.floor(rng() * 1e9),
    });
  }

  return {
    dateKey,
    stems,
    wrap: pick(rng, WRAPS),
    ribbon: dayPalette[0] as string,
    featured: kinds.map((k) => ({
      type: k,
      color: NATURAL_COLORS[k] ? null : (FLOWER_COLORS.find((c) => c.hex === kindColor.get(k))?.id ?? null),
    })),
  };
}

function dedupe<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}

/** "tulipani corallo, girasoli e lavanda" / "coral tulips, sunflowers and lavender". */
export function describeBouquet(bouquet: Pick<Bouquet, 'featured'>, lang: Lang): string {
  const parts = bouquet.featured.map(({ type, color }) => {
    const flower = flowerLabel(type, lang).toLowerCase();
    if (!color) return flower;
    const c = colorLabel(color, lang).toLowerCase();
    return lang === 'en' ? `${c} ${flower}` : `${flower} ${c}`;
  });
  return joinList(lang, parts);
}
