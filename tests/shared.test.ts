import { describe, expect, it } from 'vitest';
import { dateKey, dayNumber, isValidTimeZone, italianDate, localParts } from '../shared/dates';
import { DEFAULT_COLORS, DEFAULT_FLOWERS, FLOWER_COLORS, colorHex, composeBouquet, isFlowerColor, isFlowerType } from '../shared/flowers';
import { MESSAGES, messageFor } from '../shared/messages';
import { createRng, hashString, pick, shuffle } from '../shared/random';
import { formatTime, nextSendAt, parseTime, zonedToUtc } from '../shared/schedule';
import { greetingFor, isDark, phaseForHour, resolvePhase } from '../shared/theme';

describe('random', () => {
  it('is deterministic for a seed and stays in [0,1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 100 }, () => a());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it('hashes strings stably and differently', () => {
    expect(hashString('2026-10-10')).toBe(hashString('2026-10-10'));
    expect(hashString('2026-10-10')).not.toBe(hashString('2026-10-11'));
    expect(hashString('')).toBe(0x811c9dc5);
  });
  it('pick throws on an empty list', () => {
    expect(() => pick(createRng(1), [])).toThrow();
  });
  it('shuffle keeps every element and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(createRng(7), input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('dates', () => {
  it('validates time zones', () => {
    expect(isValidTimeZone('Europe/Rome')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('x'.repeat(65))).toBe(false);
  });
  it('computes the local day in the user zone, not UTC', () => {
    const lateUtc = Date.UTC(2026, 9, 10, 23, 30); // 01:30 on the 11th in Rome
    expect(dateKey(lateUtc, 'UTC')).toBe('2026-10-10');
    expect(dateKey(lateUtc, 'Europe/Rome')).toBe('2026-10-11');
    expect(localParts(lateUtc, 'Europe/Rome')).toMatchObject({ hour: 1, minute: 30 });
  });
  it('formats the Italian date and rejects bad keys', () => {
    expect(italianDate('2026-10-10')).toBe('sabato 10 ottobre');
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(() => dayNumber('10/10/2026')).toThrow();
  });
});

describe('schedule', () => {
  it('parses only valid HH:MM', () => {
    expect(parseTime('08:05')).toEqual({ hour: 8, minute: 5 });
    expect(parseTime('23:59')).toEqual({ hour: 23, minute: 59 });
    for (const bad of ['24:00', '8:00', '08:60', '', 'ab:cd', null, 800]) expect(parseTime(bad)).toBeNull();
    expect(formatTime({ hour: 7, minute: 3 })).toBe('07:03');
  });
  it('plans later today when the time has not passed yet', () => {
    const now = Date.UTC(2026, 9, 10, 5, 0); // 07:00 in Rome (CEST, +2)
    expect(nextSendAt(now, { hour: 8, minute: 0 }, 'Europe/Rome')).toBe(Date.UTC(2026, 9, 10, 6, 0));
  });
  it('plans tomorrow when the time has passed or is exactly now', () => {
    const now = Date.UTC(2026, 9, 10, 6, 0); // exactly 08:00 Rome
    expect(nextSendAt(now, { hour: 8, minute: 0 }, 'Europe/Rome')).toBe(Date.UTC(2026, 9, 11, 6, 0));
  });
  it('follows the DST change: 08:00 stays 08:00 local after the clocks go back', () => {
    const now = Date.UTC(2026, 9, 24, 12, 0); // Sat 24 Oct, CEST
    expect(nextSendAt(now, { hour: 8, minute: 0 }, 'Europe/Rome')).toBe(Date.UTC(2026, 9, 25, 7, 0)); // Sun, CET (+1)
  });
  it('resolves a time inside the spring-forward gap to a real instant later that morning', () => {
    const at = zonedToUtc(2026, 3, 29, { hour: 2, minute: 30 }, 'Europe/Rome');
    expect(localParts(at, 'Europe/Rome')).toMatchObject({ hour: 3, minute: 30 });
  });
  it('works in zones far from UTC', () => {
    const now = Date.UTC(2026, 9, 10, 0, 0);
    const at = nextSendAt(now, { hour: 7, minute: 30 }, 'Pacific/Auckland');
    expect(localParts(at, 'Pacific/Auckland')).toMatchObject({ hour: 7, minute: 30 });
    expect(at).toBeGreaterThan(now);
    expect(at - now).toBeLessThanOrEqual(24 * 3600_000);
  });
  it('rejects an invalid zone', () => {
    expect(() => nextSendAt(0, { hour: 8, minute: 0 }, 'Nowhere/Land')).toThrow(/time zone/);
  });
});

describe('theme', () => {
  it('maps hours to phases at the boundaries', () => {
    expect(phaseForHour(4)).toBe('notte');
    expect(phaseForHour(5)).toBe('mattina');
    expect(phaseForHour(11)).toBe('mattina');
    expect(phaseForHour(12)).toBe('pomeriggio');
    expect(phaseForHour(17)).toBe('pomeriggio');
    expect(phaseForHour(18)).toBe('sera');
    expect(phaseForHour(20)).toBe('sera');
    expect(phaseForHour(21)).toBe('notte');
    expect(phaseForHour(0)).toBe('notte');
  });
  it('rejects impossible hours', () => {
    expect(() => phaseForHour(24)).toThrow(RangeError);
    expect(() => phaseForHour(-1)).toThrow(RangeError);
    expect(() => phaseForHour(1.5)).toThrow(RangeError);
  });
  it('lets the manual override win over the clock', () => {
    expect(resolvePhase('chiaro', 23)).toBe('mattina');
    expect(resolvePhase('scuro', 9)).toBe('notte');
    expect(resolvePhase('auto', 19)).toBe('sera');
    expect(isDark('sera')).toBe(true);
    expect(isDark('pomeriggio')).toBe(false);
    expect(greetingFor('notte')).toBe('Dolce notte');
    expect(greetingFor('mattina')).toBe('Buongiorno');
    expect(greetingFor('pomeriggio')).toBe('Buon pomeriggio');
    expect(greetingFor('sera')).toBe('Buonasera');
  });
});

describe('messages', () => {
  it('never repeats on consecutive days and cycles through every message', () => {
    const start = dayNumber('2026-01-01');
    const seen = new Set<string>();
    let prev = '';
    for (let d = 0; d < MESSAGES.length; d++) {
      const key = new Date((start + d) * 86_400_000).toISOString().slice(0, 10);
      const m = messageFor(key);
      expect(m).not.toBe(prev);
      prev = m;
      seen.add(m);
    }
    expect(seen.size).toBe(MESSAGES.length);
  });
  it('is stable for the same day', () => {
    expect(messageFor('2026-10-10')).toBe(messageFor('2026-10-10'));
  });
  it('handles dates before 1970', () => {
    expect(MESSAGES).toContain(messageFor('1969-12-31'));
  });
});

describe('composeBouquet', () => {
  const prefs = { flowers: ['rosa', 'tulipano', 'lavanda'] as const, colors: ['corallo', 'magenta'] as const };

  it('is the same bouquet for the same day and preferences', () => {
    expect(composeBouquet({ ...prefs, flowers: [...prefs.flowers], colors: [...prefs.colors] }, '2026-10-10')).toEqual(
      composeBouquet({ flowers: ['lavanda', 'rosa', 'tulipano'], colors: ['magenta', 'corallo'] }, '2026-10-10'),
    );
  });
  it('changes from one day to the next', () => {
    const a = composeBouquet({ flowers: [...prefs.flowers], colors: [...prefs.colors] }, '2026-10-10');
    const b = composeBouquet({ flowers: [...prefs.flowers], colors: [...prefs.colors] }, '2026-10-11');
    expect(a).not.toEqual(b);
  });
  it('only uses chosen flowers and chosen colours (lavender keeps its own)', () => {
    const allowed = new Set(['#FF7A59', '#E0457B']);
    for (let d = 1; d <= 28; d++) {
      const b = composeBouquet({ flowers: [...prefs.flowers], colors: [...prefs.colors] }, `2026-02-${String(d).padStart(2, '0')}`);
      expect(b.stems.length).toBeGreaterThanOrEqual(11);
      expect(b.stems.length).toBeLessThanOrEqual(15);
      for (const s of b.stems) {
        expect(prefs.flowers).toContain(s.type);
        if (s.type !== 'lavanda') expect(allowed.has(s.color)).toBe(true);
        expect(s.elevation).toBeGreaterThanOrEqual(0);
        expect(s.elevation).toBeLessThanOrEqual(1);
      }
    }
  });
  it('falls back to defaults when preferences are empty or invalid', () => {
    const b = composeBouquet({ flowers: [], colors: ['nope' as never] }, '2026-10-10');
    const defaultsHex = new Set(DEFAULT_COLORS.map(colorHex));
    for (const s of b.stems) {
      expect(DEFAULT_FLOWERS).toContain(s.type);
      expect(defaultsHex.has(s.color)).toBe(true);
    }
  });
  it('a single flower and colour still makes a full bouquet', () => {
    const b = composeBouquet({ flowers: ['girasole'], colors: ['sole'] }, '2026-10-10');
    expect(b.stems.length).toBeGreaterThanOrEqual(11);
    expect(new Set(b.stems.map((s) => s.type))).toEqual(new Set(['girasole']));
    expect(b.description).toBe('girasoli giallo sole');
  });
  it('describes several kinds in Italian', () => {
    const b = composeBouquet({ flowers: ['rosa', 'lavanda'], colors: ['rosso'] }, '2026-10-10');
    expect(b.description).toMatch(/ e /);
    expect(b.description).toContain('lavanda');
  });
  it('type guards accept only known ids', () => {
    expect(isFlowerType('rosa')).toBe(true);
    expect(isFlowerType('cactus')).toBe(false);
    expect(isFlowerColor('lilla')).toBe(true);
    expect(isFlowerColor(3)).toBe(false);
    expect(colorHex(FLOWER_COLORS[0].id)).toBe(FLOWER_COLORS[0].hex);
  });
});
