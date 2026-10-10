import { FLOWER_COLORS, type Bouquet, type FlowerColor, type FlowerType, type Stem } from '../../shared/flowers';
import { createRng } from '../../shared/random';
import { normalize, placeHead, sub, type Vec3 } from './composition';

/** Flowers that have pre-rendered sprites (scripts/blender): all of them; a stem in a colour without sprites still needs 3D. */
export const SPRITE_KINDS: ReadonlySet<FlowerType> = new Set<FlowerType>(['gerbera', 'girasole', 'lavanda', 'margherita', 'peonia', 'ranuncolo', 'rosa', 'tulipano']);

/** Sprite views, named after the camera elevation they were rendered from (scripts/blender/rose.py). */
export type SpriteAngle = 'front' | 'three-quarter' | 'top';

/** Shades of a flower with its own natural colours (lavender), rendered instead of the palette. */
export type NaturalShade = 'chiara' | 'media' | 'scura';
/** The colour part of a sprite name: a palette colour, or a natural shade. */
export type SpriteColor = FlowerColor | NaturalShade;

const HEX_TO_COLOR = new Map<string, SpriteColor>(FLOWER_COLORS.map((c) => [c.hex.toUpperCase(), c.id]));
/** Hexes of NATURAL_COLORS (shared/flowers.ts) → sprite shade: these flowers never wear the palette. */
const NATURAL_SHADES: Partial<Record<FlowerType, ReadonlyMap<string, SpriteColor>>> = {
  lavanda: new Map<string, SpriteColor>([
    ['#9D86D1', 'chiara'],
    ['#8E7CC3', 'media'],
    ['#7E6BB5', 'scura'],
  ]),
};

/** Sprite colour of a stem: its natural shade for lavender, else its palette colour; null when none was rendered. */
export function spriteColor(type: FlowerType, hex: string): SpriteColor | null {
  return (NATURAL_SHADES[type] ?? HEX_TO_COLOR).get(hex.toUpperCase()) ?? null;
}

/** Every sprite colour a flower can be drawn in. */
export function spriteColors(type: FlowerType): SpriteColor[] {
  return [...(NATURAL_SHADES[type] ?? HEX_TO_COLOR).values()];
}

/** True when every stem of the bouquet has a sprite: only then is it drawn in 2D. */
export function canDrawSprites(bouquet: Pick<Bouquet, 'stems'>): boolean {
  return bouquet.stems.length > 0 && bouquet.stems.every((s) => SPRITE_KINDS.has(s.type) && spriteColor(s.type, s.color) !== null);
}

export function spriteUrl(type: FlowerType, color: SpriteColor, angle: SpriteAngle): string {
  return `/flowers/${type}-${color}-${angle}.webp`;
}

/**
 * Which view matches a head, from the angle between where it faces and the camera:
 * facing us → seen from the top of the flower, facing up or sideways → seen from the side.
 */
export function angleFor(cosToCamera: number): SpriteAngle {
  // Florists show roses tilted towards the viewer, so the three-quarter view covers most heads;
  // the side view is kept for flowers turned well away.
  if (cosToCamera > 0.85) return 'top'; // within ~32°
  if (cosToCamera > 0.2) return 'three-quarter'; // within ~78°
  return 'front';
}

// The same camera as the 3D view (bouquet3d.ts), so both styles frame the same bouquet.
const CAMERA: Vec3 = [0, 0.9, 5.4];
const TARGET: Vec3 = [0, 0.35, 0];
// A slightly narrower field of view than the 3D one (34°): sprites read better a little closer.
const FOV = (30 * Math.PI) / 180;

export interface Projector {
  /** Screen point in CSS pixels plus distance from the camera. */
  project(p: Vec3): { x: number; y: number; depth: number };
  /** Pixels per scene unit at a given distance. */
  scaleAt(depth: number): number;
}

export function createProjector(width: number, height: number): Projector {
  const forward = normalize(sub(TARGET, CAMERA));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const focal = height / 2 / Math.tan(FOV / 2);
  return {
    project(p) {
      const d = sub(p, CAMERA);
      const depth = dot(d, forward);
      return { x: width / 2 + (dot(d, right) / depth) * focal, y: height / 2 - (dot(d, up) / depth) * focal, depth };
    },
    scaleAt: (depth) => focal / depth,
  };
}

export interface HeadSprite {
  type: FlowerType;
  color: SpriteColor;
  angle: SpriteAngle;
  x: number;
  y: number;
  /** Drawn size of the square sprite, CSS pixels. */
  size: number;
  /** Rotation in radians, so the flower's axis follows where it faces. */
  rotation: number;
  depth: number;
  /** Phase of the gentle sway. */
  phase: number;
  /** Order of appearance in the entrance (outer flowers first, like the 3D view). */
  order: number;
}

export interface StemStroke {
  points: { x: number; y: number }[];
  /** Leaf on the stem: position, angle and length, or null. */
  leaf: { x: number; y: number; angle: number; length: number } | null;
}

export interface CollarLeaf {
  x: number;
  y: number;
  angle: number;
  length: number;
  depth: number;
  /** In front of the paper (true) or behind it. */
  front: boolean;
}

export interface Layout2D {
  heads: HeadSprite[];
  stems: StemStroke[];
  collar: CollarLeaf[];
  /** Paper cone: rim ellipse and the bottom point. */
  wrap: { rimX: number; rimY: number; rimRx: number; rimRy: number; tipX: number; tipY: number; tipR: number };
  /** Ribbon band height on the cone. */
  ribbon: { x: number; y: number; halfWidth: number };
}

/** Head size relative to the 3D view: the sprite square is larger than the flower it holds. */
const SPRITE_SCALE = 0.52;

/**
 * Deterministic 2D layout of a bouquet: the same stems placed with the same camera as the 3D
 * view, so day + preferences give the same arrangement in either style.
 */
export function layoutBouquet(bouquet: Pick<Bouquet, 'stems'>, width: number, height: number): Layout2D {
  const cam = createProjector(width, height);
  const order = bouquet.stems.map((s, i) => ({ s, i })).sort((a, b) => a.s.elevation - b.s.elevation);
  const heads: HeadSprite[] = [];
  const stems: StemStroke[] = [];
  order.forEach(({ s }, n) => {
    const place = placeHead(s);
    const rng = createRng(s.seed ^ 0x9e3779b9);
    const head = cam.project(place.position);
    const toCamera = normalize(sub(CAMERA, place.position));
    // Screen direction of the flower's axis: project a point a little along it.
    const tip = cam.project(add(place.position, scaleVec(place.direction, 0.2)));
    const facing = Math.atan2(tip.x - head.x, head.y - tip.y);
    const angle = angleFor(dot(place.direction, toCamera));
    const spin = (rng() - 0.5) * 0.5;
    heads.push({
      type: s.type,
      color: spriteColor(s.type, s.color) as SpriteColor,
      angle,
      x: head.x,
      y: head.y,
      size: sizeFor(s) * cam.scaleAt(head.depth) * SPRITE_SCALE,
      rotation: angle === 'top' ? spin : facing + spin * 0.3,
      depth: head.depth,
      phase: rng() * Math.PI * 2,
      order: n,
    });
    const pts = place.stem.map((p) => cam.project(p));
    const leafAt = rng() < 0.6 ? pts[2] : undefined;
    stems.push({
      points: pts.map(({ x, y }) => ({ x, y })),
      leaf: leafAt ? { x: leafAt.x, y: leafAt.y, angle: (head.x < width / 2 ? -1 : 1) * (0.7 + rng() * 0.5), length: cam.scaleAt(leafAt.depth) * (0.16 + rng() * 0.06) } : null,
    });
  });
  heads.sort((a, b) => b.depth - a.depth);

  // Collar of foliage over the paper rim, seeded like the 3D one.
  const leafRng = createRng(bouquet.stems.reduce((h, s) => (h ^ s.seed) >>> 0, 0x5bd1e995));
  const collar: CollarLeaf[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + leafRng() * 0.2;
    const p: Vec3 = [Math.sin(a) * 0.5, 0.22 + leafRng() * 0.12, Math.cos(a) * 0.5];
    const at = cam.project(p);
    const out = cam.project([Math.sin(a) * 0.9, p[1] + 0.25, Math.cos(a) * 0.9]);
    collar.push({
      x: at.x,
      y: at.y,
      angle: Math.atan2(out.x - at.x, at.y - out.y),
      length: cam.scaleAt(at.depth) * (0.3 + leafRng() * 0.1),
      depth: at.depth,
      front: Math.cos(a) > 0.15,
    });
  }
  collar.sort((a, b) => b.depth - a.depth);

  // Paper cone, as in the 3D wrap: rim at y 0.25 (radius 0.78), tip at y -1.15 (radius 0.1).
  const rimC = cam.project([0, 0.25, 0]);
  const rimR = cam.project([0.78, 0.25, 0]);
  const rimF = cam.project([0, 0.25, 0.78]);
  const tip = cam.project([0, -1.15, 0]);
  const tipR = cam.project([0.1, -1.15, 0]);
  const tie = cam.project([0, -0.42, 0.33]);
  const tieR = cam.project([0.34, -0.42, 0]);
  return {
    heads,
    stems,
    collar,
    wrap: { rimX: rimC.x, rimY: rimC.y, rimRx: rimR.x - rimC.x, rimRy: Math.max(2, rimF.y - rimC.y), tipX: tip.x, tipY: tip.y, tipR: tipR.x - tip.x },
    ribbon: { x: tie.x, y: tie.y, halfWidth: tieR.x - tie.x },
  };
}

function sizeFor(s: Pick<Stem, 'type' | 'scale'>): number {
  return (s.type === 'lavanda' ? 1.5 : s.type === 'girasole' || s.type === 'peonia' ? 1.75 : 2.0) * s.scale;
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scaleVec(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}
