import type { FlowerType } from '../../shared/flowers';

/** Petals of `n` ellipses around (24, 22), each `rx` × `ry`, drawn `dist` from the centre. */
function ring(n: number, rx: number, ry: number, dist: number, fill: string, turn = 0): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = turn + (360 / n) * i;
    out += `<ellipse cx="24" cy="${22 - dist}" rx="${rx}" ry="${ry}" fill="${fill}" transform="rotate(${a} 24 22)"/>`;
  }
  return out;
}

const STEM = '<path d="M24 30 V46" stroke="var(--stem)" stroke-width="2.5" stroke-linecap="round"/>';
const LEAF = '<path d="M24 40 C18 40 15 36 15 33 C20 33 23 36 24 40 Z" fill="var(--leaf)"/>';

/** Small, flat glyph of each flower for the preference cards (decorative: the name is the label). */
const ICONS: Record<FlowerType, string> = {
  rosa:
    STEM + LEAF +
    '<circle cx="24" cy="20" r="11" fill="#C0283C"/><path d="M24 12 C30 12 31 20 25 21 C20 22 19 16 24 16 M15 19 C16 26 22 29 28 27 M33 18 C32 24 28 27 24 27" stroke="#8A1328" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  tulipano:
    STEM + LEAF +
    '<path d="M14 12 L19 17 L24 9 L29 17 L34 12 C35 24 31 30 24 30 C17 30 13 24 14 12 Z" fill="#FF7A59"/><path d="M24 9 L24 30" stroke="#E0603F" stroke-width="1.4"/>',
  margherita: STEM + ring(12, 2.6, 7, 8, '#FFF6E5') + '<circle cx="24" cy="22" r="5" fill="#FFC845"/>',
  girasole: STEM + ring(14, 3, 7.5, 9.5, '#FFC845') + '<circle cx="24" cy="22" r="6.5" fill="#6B3E1E"/>',
  peonia:
    STEM + LEAF +
    ring(7, 6, 7, 6, '#F2B8C2') + ring(5, 4, 5, 3, '#E99AAB', 36) + '<circle cx="24" cy="22" r="3.5" fill="#F2B8C2"/>',
  lavanda:
    '<path d="M24 46 V10" stroke="var(--stem)" stroke-width="2.2" stroke-linecap="round"/>' +
    [10, 15, 20, 25, 30].map((y, i) => `<ellipse cx="${i % 2 ? 27 : 21}" cy="${y}" rx="3.2" ry="4" fill="#8E7CC3"/><ellipse cx="${i % 2 ? 21 : 27}" cy="${y + 2}" rx="3" ry="3.6" fill="#9D86D1"/>`).join(''),
  ranuncolo:
    STEM + LEAF +
    '<circle cx="24" cy="21" r="11" fill="#F8B98B"/><circle cx="24" cy="21" r="8" fill="none" stroke="#E79A66" stroke-width="1.4"/><circle cx="24" cy="21" r="5" fill="none" stroke="#E79A66" stroke-width="1.4"/><circle cx="24" cy="21" r="2" fill="#E79A66"/>',
  gerbera: STEM + ring(16, 2.4, 8, 9, '#E0457B') + '<circle cx="24" cy="22" r="5" fill="#7A4A1E"/><circle cx="24" cy="22" r="2.4" fill="#FFC845"/>',
};

export function flowerIcon(type: FlowerType): string {
  return `<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true" focusable="false">${ICONS[type]}</svg>`;
}
