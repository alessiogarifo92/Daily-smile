import { describe, expect, it } from 'vitest';
import { DOME_CENTER, DOME_RADIUS, MAX_POLAR, easeOutBack, length, normalize, placeHead } from '../web/src/composition';
import { STORAGE_KEY, defaultPreferences, loadPreferences, sanitizePreferences, savePreferences } from '../web/src/prefs';

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
    });
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
