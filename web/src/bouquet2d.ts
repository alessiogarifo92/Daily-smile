import type { Bouquet } from '../../shared/flowers';
import { easeOutBack } from './composition';
import { LEAF_VARIANTS, layoutBouquet, leafUrl, ribbonUrl, spriteUrl, wrapUrl, type Layout2D } from './sprites';
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

  // Heads, the leaf shapes, and the paper and ribbon of the day: all rendered sprites.
  const loadSprites = async (b: Bouquet) => {
    const paper = [wrapUrl(b.wrap, 'back'), wrapUrl(b.wrap, 'front'), ribbonUrl(b.ribbon)];
    if (paper.some((u) => u === null)) throw new Error('no paper sprites');
    const heads = layoutBouquet(b, 100, 100).heads.map((h) => spriteUrl(h.type, h.color, h.angle));
    const leaves = Array.from({ length: LEAF_VARIANTS }, (_, i) => leafUrl(i + 1));
    const urls = [...new Set([...heads, ...leaves, ...(paper as string[])])];
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

  function draw(now: number): void {
    if (!layout || !ctx) return;
    const elapsed = (now - startedAt) / 1000;
    const t = reducedMotion ? 1 : elapsed / 1.3;
    const rise = (1 - Math.min(1, Math.max(0, t))) * height * 0.12;
    const grow = Math.max(0.001, easeOutBack(t));
    // Stems match the green of the rendered leaves (scripts/blender/leaves.py), not the UI's --stem.
    const stem = '#4A8650';
    const { wrap } = layout;
    const leaf = (x: number, y: number, angle: number, length: number, variant: number) => {
      const img = sprites.get(leafUrl(variant));
      if (!img) return;
      // The sprite frames the leaf from 1% below its base to 1% above its tip, 1.02 lengths wide.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.drawImage(img, -0.51 * length, -1.01 * length, 1.02 * length, 1.02 * length);
      ctx.restore();
    };
    // Paper layers were rendered with this view's camera: centred, as tall as the canvas.
    const paper = (url: string | null) => {
      const img = url ? sprites.get(url) : undefined;
      if (img) ctx.drawImage(img, width / 2 - height / 2, 0, height, height);
    };

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    // Grow from the tie point, like the 3D entrance.
    ctx.translate(wrap.tipX, wrap.tipY + rise);
    ctx.scale(grow, grow);
    ctx.translate(-wrap.tipX, -wrap.tipY);

    for (const l of layout.collar) if (!l.front) leaf(l.x, l.y, l.angle, l.length, l.variant);
    // Inside of the cone, behind the stems.
    paper(wrapUrl(current.wrap, 'back'));

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
      if (s.leaf) leaf(s.leaf.x, s.leaf.y, s.leaf.angle, s.leaf.length, s.leaf.variant);
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

    for (const l of layout.collar) if (l.front) leaf(l.x, l.y, l.angle, l.length, l.variant);
    paper(wrapUrl(current.wrap, 'front'));
    paper(ribbonUrl(current.ribbon));
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
