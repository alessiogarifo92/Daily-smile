/** CIE Lab (D65) of an sRGB "#RRGGBB" colour. */
export function hexToLab(hex: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Perceived distance between two colours (CIE76 ΔE): ~2 barely visible, 20+ clearly different. */
export function deltaE(a: string, b: string): number {
  const p = hexToLab(a);
  const q = hexToLab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** How saturated a colour looks (Lab chroma): cream ~9, coral ~64. */
export function chroma(hex: string): number {
  const [, a, b] = hexToLab(hex);
  return Math.hypot(a, b);
}
