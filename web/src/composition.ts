import type { Stem } from '../../shared/flowers';

export type Vec3 = [number, number, number];

/** Bouquet layout constants (scene units ≈ metres / 3). */
export const DOME_CENTER: Vec3 = [0, 0.42, 0];
export const DOME_RADIUS = 0.72;
export const MAX_POLAR = (72 * Math.PI) / 180;
/** Where every stem converges, hidden inside the paper wrap. */
export const STEM_BASE: Vec3 = [0, -1.0, 0];
/** Point heads face away from, so the bouquet opens like a fan. */
const FOCUS: Vec3 = [0, -0.3, 0];

export interface HeadPlacement {
  position: Vec3;
  /** Unit vector the flower head faces. */
  direction: Vec3;
  /** Control points of the stem, from the base to just under the head. */
  stem: Vec3[];
}

export function placeHead(stem: Pick<Stem, 'azimuth' | 'elevation'>): HeadPlacement {
  const elevation = Math.min(1, Math.max(0, stem.elevation));
  const polar = (1 - elevation) * MAX_POLAR;
  const position: Vec3 = [
    DOME_CENTER[0] + DOME_RADIUS * Math.sin(polar) * Math.cos(stem.azimuth),
    DOME_CENTER[1] + DOME_RADIUS * Math.cos(polar),
    DOME_CENTER[2] + DOME_RADIUS * Math.sin(polar) * Math.sin(stem.azimuth),
  ];
  const direction = normalize(sub(position, FOCUS));
  const under = sub(position, scale(direction, 0.06));
  const tie: Vec3 = [position[0] * 0.06, -0.35, position[2] * 0.06];
  const mid: Vec3 = [position[0] * 0.45, (tie[1] + under[1]) / 2, position[2] * 0.45];
  return { position, direction, stem: [STEM_BASE, tie, mid, under] };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}
export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  if (l === 0) return [0, 1, 0];
  return scale(a, 1 / l);
}

/** Smooth entrance curve with a little overshoot, clamped to [0, 1] input. */
export function easeOutBack(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
