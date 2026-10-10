import type { Bouquet } from '../../shared/flowers';
import { easeOutBack } from './composition';
import { layoutBouquet, spriteUrl, type Layout2D } from './sprites';
import type { BouquetView } from './view';

const images = new Map<string, Promise<HTMLImageElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`sprite ${url}`));
      img.src = url;
    });
    // A failed download can be retried with the next bouquet.
    p.catch(() => images.delete(url));
    images.set(url, p);
  }
  return p;
}

/**
 * Realistic style: pre-rendered flower sprites composed on a 2D canvas, with the same
 * arrangement as the 3D view. Resolves to null if a sprite cannot be loaded.
 */
export async function createBouquet2DView(container: HTMLElement, bouquet: Bouquet): Promise<BouquetView | null> {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let current = bouquet;
  let sprites = new Map<string, HTMLImageElement>();
  let layout: Layout2D | null = null;
  let width = 1;
  let height = 1;
  let startedAt = 0;
  let active = true;
  let raf = 0;

  const loadSprites = async (b: Bouquet) => {
    const urls = [...new Set(layoutBouquet(b, 100, 100).heads.map((h) => spriteUrl(h.type, h.color, h.angle)))];
    const loaded = await Promise.all(urls.map(loadImage));
    return new Map(urls.map((u, i) => [u, loaded[i] as HTMLImageElement]));
  };
  try {
    sprites = await loadSprites(bouquet);
  } catch {
    return null;
  }
  container.appendChild(canvas);

  const resize = () => {
    width = container.clientWidth || 1;
    height = container.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout = layoutBouquet(current, width, height);
    if (reducedMotion || !active) draw(performance.now());
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  const css = (name: string, fallback: string) => getComputedStyle(container).getPropertyValue(name).trim() || fallback;

  function draw(now: number): void {
    if (!layout || !ctx) return;
    const elapsed = (now - startedAt) / 1000;
    const t = reducedMotion ? 1 : elapsed / 1.3;
    const rise = (1 - Math.min(1, Math.max(0, t))) * height * 0.12;
    const grow = Math.max(0.001, easeOutBack(t));
    const stem = css('--stem', '#3e9a6e');
    const leaf = css('--leaf', '#5fb38a');
    const { wrap } = layout;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    // Grow from the tie point, like the 3D entrance.
    ctx.translate(wrap.tipX, wrap.tipY + rise);
    ctx.scale(grow, grow);
    ctx.translate(-wrap.tipX, -wrap.tipY);

    for (const l of layout.collar) if (!l.front) drawLeaf(ctx, l.x, l.y, l.angle, l.length, leaf, stem);
    // Inside of the cone, behind the stems.
    ctx.fillStyle = shade(current.wrap, -0.18);
    ctx.beginPath();
    ctx.ellipse(wrap.rimX, wrap.rimY, wrap.rimRx, wrap.rimRy, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';
    ctx.strokeStyle = stem;
    for (const s of layout.stems) {
      const [a, b, c, d] = s.points;
      if (!a || !b || !c || !d) continue;
      ctx.lineWidth = Math.max(2, width * 0.008);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(b.x, b.y, c.x, c.y, d.x, d.y);
      ctx.stroke();
      if (s.leaf) drawLeaf(ctx, s.leaf.x, s.leaf.y, s.leaf.angle, s.leaf.length, leaf, stem);
    }

    for (const h of layout.heads) {
      const img = sprites.get(spriteUrl(h.type, h.color, h.angle));
      if (!img) continue;
      const k = reducedMotion ? 1 : Math.max(0, easeOutBack((elapsed - 0.35 - h.order * 0.07) / 0.8));
      if (k <= 0.001) continue;
      const sway = reducedMotion ? 0 : Math.sin(now / 1500 + h.phase) * 0.035;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rotation + sway);
      ctx.scale(k, k);
      ctx.drawImage(img, -h.size / 2, -h.size / 2, h.size, h.size);
      ctx.restore();
    }

    for (const l of layout.collar) if (l.front) drawLeaf(ctx, l.x, l.y, l.angle, l.length, leaf, stem);
    drawWrap(ctx, layout, current.wrap, current.ribbon);
    ctx.restore();
  }

  let last = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (now - last < 1000 / 30) return; // 30 fps is plenty for a gentle sway
    last = now;
    draw(now);
  };
  const start = () => {
    cancelAnimationFrame(raf);
    if (reducedMotion) draw(performance.now());
    else raf = requestAnimationFrame(loop);
  };

  startedAt = performance.now();
  resize();
  start();

  return {
    show(next) {
      current = next;
      void loadSprites(next)
        .then((map) => {
          if (current !== next) return;
          sprites = map;
          layout = layoutBouquet(next, width, height);
          startedAt = performance.now();
          if (active) start();
        })
        .catch(() => {
          /* keep the previous bouquet on screen */
        });
    },
    setActive(next) {
      if (next === active) return;
      active = next;
      if (next) start();
      else cancelAnimationFrame(raf);
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.remove();
    },
  };
}

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, length: number, light: string, dark: string): void {
  const w = length * 0.32;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, dark);
  g.addColorStop(0.55, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(w, -length * 0.25, w * 0.8, -length * 0.75, 0, -length);
  ctx.bezierCurveTo(-w * 0.8, -length * 0.75, -w, -length * 0.25, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgb(255 255 255 / 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -length * 0.05);
  ctx.quadraticCurveTo(w * 0.1, -length * 0.5, 0, -length * 0.92);
  ctx.stroke();
  ctx.restore();
}

/** Pleated paper cone in front of the stems, with the ribbon bow at the tie point. */
function drawWrap(ctx: CanvasRenderingContext2D, layout: Layout2D, paper: string, ribbon: string): void {
  const { wrap, ribbon: tie } = layout;
  const left = wrap.rimX - wrap.rimRx;
  const right = wrap.rimX + wrap.rimRx;
  const g = ctx.createLinearGradient(left, 0, right, 0);
  g.addColorStop(0, shade(paper, -0.14));
  g.addColorStop(0.45, shade(paper, 0.06));
  g.addColorStop(1, shade(paper, -0.2));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(left, wrap.rimY);
  // Front half of the rim, gently scalloped like folded paper.
  const folds = 7;
  for (let i = 1; i <= folds; i++) {
    const a0 = Math.PI - ((i - 0.5) / folds) * Math.PI;
    const a1 = Math.PI - (i / folds) * Math.PI;
    ctx.quadraticCurveTo(
      wrap.rimX + Math.cos(a0) * wrap.rimRx,
      wrap.rimY + Math.sin(a0) * wrap.rimRy * 1.6 + wrap.rimRy * 0.6,
      wrap.rimX + Math.cos(a1) * wrap.rimRx,
      wrap.rimY + Math.sin(a1) * wrap.rimRy,
    );
  }
  ctx.lineTo(wrap.tipX + wrap.tipR, wrap.tipY);
  ctx.lineTo(wrap.tipX - wrap.tipR, wrap.tipY);
  ctx.closePath();
  ctx.fill();

  // Pleat creases.
  ctx.strokeStyle = shade(paper, -0.12);
  ctx.lineWidth = 1;
  for (const f of [-0.55, -0.2, 0.2, 0.55]) {
    ctx.beginPath();
    ctx.moveTo(wrap.rimX + f * wrap.rimRx, wrap.rimY + wrap.rimRy * 1.2);
    ctx.lineTo(wrap.tipX + f * wrap.tipR, wrap.tipY);
    ctx.stroke();
  }

  // Ribbon: a band and a bow.
  const band = Math.max(3, tie.halfWidth * 0.12);
  ctx.strokeStyle = ribbon;
  ctx.lineCap = 'round';
  ctx.lineWidth = band;
  ctx.beginPath();
  ctx.moveTo(tie.x - tie.halfWidth, tie.y - band * 0.6);
  ctx.quadraticCurveTo(tie.x, tie.y + band * 1.4, tie.x + tie.halfWidth, tie.y - band * 0.6);
  ctx.stroke();
  ctx.fillStyle = ribbon;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(tie.x + side * band * 1.6, tie.y);
    ctx.rotate(side * 0.35);
    ctx.beginPath();
    ctx.ellipse(0, 0, band * 2.2, band * 1.2, 0, 0, Math.PI * 2);
    ctx.lineWidth = band * 0.7;
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(tie.x, tie.y);
    ctx.lineTo(tie.x + side * band * 1.4, tie.y + band * 5);
    ctx.lineWidth = band * 0.8;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(tie.x, tie.y, band * 0.8, 0, Math.PI * 2);
  ctx.fill();
}

/** Lightens (amount > 0) or darkens (< 0) a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n) || hex.replace('#', '').length !== 6) return hex;
  const ch = (v: number) => Math.round(Math.min(255, Math.max(0, amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
