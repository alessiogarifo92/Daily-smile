import { describe, expect, it } from 'vitest';
import { DOME_CENTER, DOME_RADIUS, MAX_POLAR, easeOutBack, length, normalize, placeHead } from '../web/src/composition';
import { STORAGE_KEY, defaultPreferences, loadPreferences, sanitizePreferences, savePreferences } from '../web/src/prefs';
import { shade } from '../web/src/bouquet2d';
import { SPRITE_KINDS, angleFor, canDrawSprites, createProjector, layoutBouquet, spriteColor, spriteUrl } from '../web/src/sprites';
import { composeBouquet, FLOWER_COLORS } from '../shared/flowers';
import { existsSync } from 'node:fs';
import { cleanDigits, hourComplete, partsToTime, shiftTime, timeToParts } from '../web/src/timeInput';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('preferences', () => {
  it('round-trips through storage', () => {
    const s = memoryStorage();
    const p = { ...defaultPreferences(), flowers: ['peonia' as const], time: '21:45', notifications: true, theme: 'scuro' as const };
    expect(savePreferences(s, p)).toBe(true);
    expect(loadPreferences(s)).toEqual(p);
  });
  it('falls back to defaults for missing, corrupt or hostile data', () => {
    expect(loadPreferences(undefined)).toEqual(defaultPreferences());
    expect(loadPreferences(memoryStorage())).toEqual(defaultPreferences());
    expect(loadPreferences(memoryStorage({ [STORAGE_KEY]: '{not json' }))).toEqual(defaultPreferences());
    expect(sanitizePreferences(null)).toEqual(defaultPreferences());
    expect(sanitizePreferences('x')).toEqual(defaultPreferences());
  });
  it('drops unknown values field by field and keeps the valid ones', () => {
    const p = sanitizePreferences({
      flowers: ['rosa', 'cactus', 'rosa', 3],
      colors: ['<script>', 'lilla'],
      time: '25:00',
      notifications: 'yes',
      theme: 'neon',
      lang: 'fr',
      realistic: 'no',
    });
    expect(p.lang).toBe('auto');
    expect(p.realistic).toBe(true);
    expect(sanitizePreferences({ realistic: false }).realistic).toBe(false);
    expect(p.style).toBe('realistico');
    expect(sanitizePreferences({ style: '3d' }).style).toBe('3d');
    expect(sanitizePreferences({ style: 'vr' }).style).toBe('realistico');
    expect(sanitizePreferences({ lang: 'en' }).lang).toBe('en');
    expect(p.flowers).toEqual(['rosa']);
    expect(p.colors).toEqual(['lilla']);
    expect(p.time).toBe('08:00');
    expect(p.notifications).toBe(false);
    expect(p.theme).toBe('auto');
  });
  it('never stores an empty selection', () => {
    const p = sanitizePreferences({ flowers: [], colors: [] });
    expect(p.flowers.length).toBeGreaterThan(0);
    expect(p.colors.length).toBeGreaterThan(0);
  });
  it('reports failure when storage throws (private mode, quota)', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(savePreferences(broken, defaultPreferences())).toBe(false);
    expect(savePreferences(undefined, defaultPreferences())).toBe(false);
    expect(loadPreferences(broken)).toEqual(defaultPreferences());
  });
});

describe('bouquet layout', () => {
  it('puts the top flower straight above the dome centre', () => {
    const p = placeHead({ azimuth: 0, elevation: 1 });
    expect(p.position[0]).toBeCloseTo(DOME_CENTER[0]);
    expect(p.position[1]).toBeCloseTo(DOME_CENTER[1] + DOME_RADIUS);
    expect(p.direction[1]).toBeCloseTo(1);
  });
  it('fans heads outward, all above the tie point, with unit directions', () => {
    for (let i = 0; i < 40; i++) {
      const p = placeHead({ azimuth: i * 0.7, elevation: i / 39 });
      expect(p.position[1]).toBeGreaterThan(0.5);
      expect(length(p.direction)).toBeCloseTo(1);
      expect(p.stem).toHaveLength(4);
      expect(p.stem[0]).toEqual([0, -1.0, 0]);
    }
    const edge = placeHead({ azimuth: 0, elevation: 0 });
    expect(Math.atan2(Math.hypot(edge.position[0] - DOME_CENTER[0], edge.position[2]), edge.position[1] - DOME_CENTER[1])).toBeCloseTo(MAX_POLAR);
  });
  it('clamps out-of-range elevation', () => {
    expect(placeHead({ azimuth: 0, elevation: 5 })).toEqual(placeHead({ azimuth: 0, elevation: 1 }));
    expect(placeHead({ azimuth: 0, elevation: -2 })).toEqual(placeHead({ azimuth: 0, elevation: 0 }));
  });
  it('normalize handles the zero vector', () => {
    expect(normalize([0, 0, 0])).toEqual([0, 1, 0]);
  });
  it('easing starts at 0, overshoots, ends at 1 and clamps', () => {
    expect(easeOutBack(0)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => easeOutBack(i / 49)))).toBeGreaterThan(1);
    expect(easeOutBack(-3)).toBeCloseTo(0);
    expect(easeOutBack(9)).toBeCloseTo(1);
  });
});

describe('time boxes', () => {
  it('keep only up to two digits', () => {
    expect(cleanDigits('0a7')).toBe('07');
    expect(cleanDigits('123')).toBe('12');
    expect(cleanDigits('')).toBe('');
    expect(cleanDigits('ab')).toBe('');
  });
  it('turn typed parts into a valid time, clamping out-of-range values', () => {
    expect(partsToTime('7', '5')).toEqual({ hour: 7, minute: 5 });
    expect(partsToTime('09', '45')).toEqual({ hour: 9, minute: 45 });
    expect(partsToTime('25', '75')).toEqual({ hour: 23, minute: 59 });
    expect(partsToTime('00', '00')).toEqual({ hour: 0, minute: 0 });
  });
  it('report an incomplete time as null', () => {
    expect(partsToTime('', '30')).toBeNull();
    expect(partsToTime('8', '')).toBeNull();
    expect(partsToTime('x', 'y')).toBeNull();
  });
  it('format back to padded parts', () => {
    expect(timeToParts({ hour: 8, minute: 5 })).toEqual(['08', '05']);
  });
  it('shift across midnight both ways', () => {
    expect(shiftTime({ hour: 23, minute: 50 }, 15)).toEqual({ hour: 0, minute: 5 });
    expect(shiftTime({ hour: 0, minute: 5 }, -15)).toEqual({ hour: 23, minute: 50 });
    expect(shiftTime({ hour: 8, minute: 0 }, 0)).toEqual({ hour: 8, minute: 0 });
  });
  it('know when the hour box is complete', () => {
    expect(hourComplete('0')).toBe(false);
    expect(hourComplete('1')).toBe(false);
    expect(hourComplete('2')).toBe(false);
    expect(hourComplete('3')).toBe(true); // no hour starts with 3x
    expect(hourComplete('09')).toBe(true);
    expect(hourComplete('')).toBe(false);
  });
});

describe('withTimeout', () => {
  it('resolves when the promise wins and rejects with a readable error when time runs out', async () => {
    const { withTimeout, PushError } = await import('../web/src/push');
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toBeInstanceOf(PushError);
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom');
  });
});

describe('2D sprite bouquet', () => {
  const roses = (colors: (typeof FLOWER_COLORS)[number]['id'][], day = '2026-10-10') => composeBouquet({ flowers: ['rosa'], colors }, day);

  it('draws in 2D only when every flower has sprites', () => {
    expect(SPRITE_KINDS.has('rosa')).toBe(true);
    expect(canDrawSprites(roses(['rosso', 'panna']))).toBe(true);
    expect(canDrawSprites(composeBouquet({ flowers: ['rosa', 'tulipano'], colors: ['rosso'] }, '2026-10-10'))).toBe(
      composeBouquet({ flowers: ['rosa', 'tulipano'], colors: ['rosso'] }, '2026-10-10').stems.every((s) => s.type === 'rosa'),
    );
    expect(canDrawSprites(composeBouquet({ flowers: ['tulipano'], colors: ['rosso'] }, '2026-10-10'))).toBe(true);
    expect(canDrawSprites(composeBouquet({ flowers: ['margherita'], colors: ['panna'] }, '2026-10-10'))).toBe(true);
    expect(canDrawSprites(composeBouquet({ flowers: ['girasole'], colors: ['azzurro'] }, '2026-10-10'))).toBe(true);
    expect(canDrawSprites(composeBouquet({ flowers: ['peonia'], colors: ['cipria'] }, '2026-10-10'))).toBe(false);
    expect(canDrawSprites({ stems: [] })).toBe(false);
    // A colour outside the palette (lavender's natural purples) has no sprite.
    expect(canDrawSprites({ stems: [{ ...roses(['rosso']).stems[0]!, color: '#8E7CC3' }] })).toBe(false);
  });
  it('every sprite the app can ask for exists in public/flowers', () => {
    expect([...SPRITE_KINDS].sort()).toEqual(['girasole', 'margherita', 'rosa', 'tulipano']);
    for (const kind of SPRITE_KINDS) {
      for (const c of FLOWER_COLORS) {
        for (const a of ['front', 'three-quarter', 'top'] as const) {
          const url = spriteUrl(kind, c.id, a);
          expect(existsSync(`web/public${url}`), url).toBe(true);
        }
      }
    }
  });
  it('maps colours case-insensitively and rejects unknown ones', () => {
    expect(spriteColor('#c0283c')).toBe('rosso');
    expect(spriteColor('#123456')).toBeNull();
  });
  it('picks the view from how much the flower faces the camera', () => {
    expect(angleFor(1)).toBe('top');
    expect(angleFor(0.89)).toBe('top');
    expect(angleFor(0.7)).toBe('three-quarter');
    expect(angleFor(0.3)).toBe('three-quarter');
    expect(angleFor(0.1)).toBe('front');
    expect(angleFor(-1)).toBe('front');
  });
  it('projects the scene centre to the middle and nearer things larger', () => {
    const cam = createProjector(400, 300);
    const target = cam.project([0, 0.35, 0]);
    expect(target.x).toBeCloseTo(200, 6);
    expect(target.y).toBeCloseTo(150, 6);
    expect(cam.scaleAt(2)).toBeGreaterThan(cam.scaleAt(5));
  });
  it('the same day and preferences always give the same layout', () => {
    const b = roses(['rosso', 'cipria', 'panna']);
    expect(layoutBouquet(b, 390, 420)).toEqual(layoutBouquet(roses(['rosso', 'cipria', 'panna']), 390, 420));
    expect(layoutBouquet(roses(['rosso', 'cipria', 'panna'], '2026-10-11'), 390, 420)).not.toEqual(layoutBouquet(b, 390, 420));
  });
  it('places every head on screen, back to front, in its own colour', () => {
    const b = roses(['rosso', 'cipria', 'panna']);
    const l = layoutBouquet(b, 390, 420);
    expect(l.heads).toHaveLength(b.stems.length);
    expect(l.stems).toHaveLength(b.stems.length);
    for (let i = 1; i < l.heads.length; i++) expect(l.heads[i - 1]!.depth).toBeGreaterThanOrEqual(l.heads[i]!.depth);
    for (const h of l.heads) {
      expect(h.x).toBeGreaterThan(0);
      expect(h.x).toBeLessThan(390);
      expect(h.y).toBeGreaterThan(0);
      expect(h.y).toBeLessThan(420);
      expect(h.size).toBeGreaterThan(20);
      expect(['rosso', 'cipria', 'panna']).toContain(h.color);
    }
    expect(new Set(l.heads.map((h) => h.order)).size).toBe(b.stems.length);
    // The paper hangs below the flowers, its tip under the rim.
    expect(l.wrap.tipY).toBeGreaterThan(l.wrap.rimY);
    expect(l.collar).toHaveLength(16);
    expect(l.collar.some((c) => c.front) && l.collar.some((c) => !c.front)).toBe(true);
  });
  it('scales with the canvas', () => {
    const b = roses(['rosso']);
    const small = layoutBouquet(b, 200, 200).heads[0]!;
    const big = layoutBouquet(b, 400, 400).heads[0]!;
    expect(big.size).toBeCloseTo(small.size * 2, 6);
    expect(big.x).toBeCloseTo(small.x * 2, 6);
  });
  it('shade lightens and darkens a colour and leaves bad input alone', () => {
    expect(shade('#808080', 0)).toBe('#808080');
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#ff0000', -0.5)).toBe('#800000');
    expect(shade('red', 0.2)).toBe('red');
    expect(shade('#12345', 0.2)).toBe('#12345');
  });
});
