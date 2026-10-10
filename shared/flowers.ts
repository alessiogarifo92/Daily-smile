import { joinList, type Lang } from './i18n';
import { dayNumber } from './dates';
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
export const NATURAL_COLORS: Partial<Record<FlowerType, string[]>> = {
  lavanda: ['#8E7CC3', '#9D86D1', '#7E6BB5'],
};

/**
 * Colours each flower really comes in (florist varieties included). With "realistic colours"
 * on, a flower only wears these; sky blue and white sunflowers stay out.
 */
export const REAL_COLORS: Record<Exclude<FlowerType, 'lavanda'>, readonly FlowerColor[]> = {
  rosa: ['corallo', 'sole', 'magenta', 'cipria', 'rosso', 'lilla', 'pesca', 'panna'],
  tulipano: ['corallo', 'sole', 'magenta', 'cipria', 'rosso', 'lilla', 'pesca', 'panna'],
  margherita: ['panna', 'cipria', 'magenta'],
  girasole: ['sole', 'corallo', 'rosso'],
  peonia: ['corallo', 'sole', 'magenta', 'cipria', 'rosso', 'pesca', 'panna'],
  ranuncolo: ['corallo', 'sole', 'magenta', 'cipria', 'rosso', 'lilla', 'pesca', 'panna'],
  gerbera: ['corallo', 'sole', 'magenta', 'cipria', 'rosso', 'pesca', 'panna'],
};

/** Whether a flower comes in that colour in nature (lavender keeps its own colour anyway). */
export function isRealColor(type: FlowerType, color: FlowerColor): boolean {
  return type === 'lavanda' || REAL_COLORS[type].includes(color);
}

const HEX_TO_ID = new Map<string, FlowerColor>(FLOWER_COLORS.map((c) => [c.hex, c.id]));

/**
 * A colour the flower can really have: the given one if real, else the first real one of
 * today's colours, else of all the chosen ones. When none of the chosen colours is real for
 * this flower, the user's choice wins and the colour stays as it is.
 */
export function fitRealColor(type: FlowerType, hex: string, today: readonly string[], chosen: readonly string[]): string {
  const real = (h: string) => {
    const id = HEX_TO_ID.get(h);
    return id !== undefined && isRealColor(type, id);
  };
  if (real(hex)) return hex;
  return today.find(real) ?? chosen.find(real) ?? hex;
}

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
  /** How many kinds and colours today's bouquet uses: changes every day. */
  style: BouquetStyle;
}

export interface BouquetStyle {
  kinds: number;
  colors: number;
}

/**
 * Every (kinds, colours) combination the selection allows: a single flower, a pair, a mix;
 * one colour (monochrome), two, or all the chosen ones.
 */
export function availableStyles(flowerCount: number, colorCount: number): BouquetStyle[] {
  const uniq = (xs: number[], max: number) => [...new Set(xs.map((x) => Math.min(x, max)))].filter((x) => x >= 1);
  const kinds = uniq([1, 2, 3, 5], flowerCount);
  const colors = uniq([1, 2, 3], colorCount);
  return kinds.flatMap((k) => colors.map((c) => ({ kinds: k, colors: c })));
}

/**
 * Style for a day. Walks the styles with a stride that is never a multiple of their count,
 * so two consecutive days always get a different style (when more than one exists).
 */
export function styleForDay(styles: BouquetStyle[], dateKey: string, salt: number): BouquetStyle {
  const n = styles.length;
  const stride = n === 1 ? 0 : 1 + (salt % (n - 1));
  // Coprime stride: consecutive days differ and every style comes round.
  let s = stride;
  while (n > 1 && gcd(s, n) !== 1) s = (s % (n - 1)) + 1;
  const index = (((dayNumber(dateKey) * s + salt) % n) + n) % n;
  return styles[index] as BouquetStyle;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

const WRAPS = ['#F3E6D3', '#E9DCEF', '#DCE8E0', '#F5DCD3'];

export interface BouquetPreferences {
  flowers: readonly FlowerType[];
  colors: readonly FlowerColor[];
  /** Each flower only in colours it has in nature (off when absent). */
  realistic?: boolean;
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

  const selection = `${types.join(',')}|${palette.join(',')}`;
  const rng = createRng(hashString(`${dateKey}|${selection}`));

  // Today's style decides how many kinds and colours appear; the picks themselves are random.
  const style = styleForDay(availableStyles(types.length, palette.length), dateKey, hashString(selection));
  const kinds = shuffle(rng, types).slice(0, style.kinds);
  const dayPalette = shuffle(rng, palette).slice(0, style.colors);

  const count = 11 + Math.floor(rng() * 5); // 11..15 stems
  const kindColor = new Map<FlowerType, string>();
  const fit = (type: FlowerType, hex: string) => (prefs.realistic ? fitRealColor(type, hex, dayPalette, palette) : hex);
  kinds.forEach((k, i) => kindColor.set(k, fit(k, dayPalette[i % dayPalette.length] as string)));
  const spare = dayPalette.filter((hex) => ![...kindColor.entries()].some(([k, c]) => c === hex && !NATURAL_COLORS[k]));

  const stems: Stem[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const spin = rng() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const type = i < kinds.length ? (kinds[i] as FlowerType) : pick(rng, kinds);
    const natural = NATURAL_COLORS[type];
    // Each kind wears its own colour; colours no kind took are given to the next stems,
    // so every colour of today's style really shows up.
    // With realistic colours, a spare colour waits for a flower that can wear it.
    const spareAt = i >= kinds.length ? spare.findIndex((hex) => fit(type, hex) === hex) : -1;
    let color: string;
    if (natural) color = pick(rng, natural);
    else if (spareAt >= 0) color = spare.splice(spareAt, 1)[0] as string;
    else color = i < kinds.length || rng() < 0.6 ? (kindColor.get(type) as string) : (dayPalette[i % dayPalette.length] as string);
    if (!natural) color = fit(type, color);
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
    style,
  };
}

function dedupe<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}

/** Grammatical gender of each flower's Italian plural, for colour agreement. */
const FEMININE = new Set<FlowerType>(['rosa', 'margherita', 'peonia', 'lavanda', 'gerbera']);

/**
 * Italian colour as an adjective for a flower: true adjectives agree ("rose rosse",
 * "tulipani azzurri"), colours that are nouns stay as they are ("rose corallo").
 */
export function italianColor(color: FlowerColor, flower: FlowerType): string {
  const f = FEMININE.has(flower);
  switch (color) {
    case 'rosso':
      return f ? 'rosse' : 'rossi';
    case 'azzurro':
      return f ? 'azzurre' : 'azzurri';
    default:
      return colorLabel(color, 'it').toLowerCase();
  }
}

/** "tulipani corallo, girasoli e lavanda" / "coral tulips, sunflowers and lavender". */
export function describeBouquet(bouquet: Pick<Bouquet, 'featured'>, lang: Lang): string {
  const parts = bouquet.featured.map(({ type, color }) => {
    const flower = flowerLabel(type, lang).toLowerCase();
    if (!color) return flower;
    return lang === 'en' ? `${colorLabel(color, 'en').toLowerCase()} ${flower}` : `${flower} ${italianColor(color, type)}`;
  });
  return joinList(lang, parts);
}
