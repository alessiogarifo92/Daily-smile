import { describe, expect, it } from 'vitest';
import { dateKey, dayNumber, formatDate, isValidTimeZone, italianDate, localParts } from '../shared/dates';
import { DEFAULT_COLORS, DEFAULT_FLOWERS, FLOWER_COLORS, FLOWER_TYPES, availableStyles, italianColor, styleForDay, colorHex, colorLabel, composeBouquet, describeBouquet, flowerLabel, isFlowerColor, isFlowerType } from '../shared/flowers';
import type { FlowerColor, FlowerType } from '../shared/flowers';
import { STRINGS, isLang, joinList, langFromLocale, resolveLang, t } from '../shared/i18n';
import { MESSAGES, MESSAGES_EN, messageFor } from '../shared/messages';
import { QUOTES_EN } from '../shared/content/messages-en';
import { QUOTES_IT } from '../shared/content/messages-it';
import { createRng, hashString, pick, shuffle } from '../shared/random';
import { formatTime, giftDayKey, nextSendAt, parseTime, zonedToUtc } from '../shared/schedule';
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
    expect(describeBouquet(b, 'it')).toBe('girasoli giallo sole');
    expect(describeBouquet(b, 'en')).toBe('sunshine yellow sunflowers');
  });
  it('describes several kinds in Italian', () => {
    const b = composeBouquet({ flowers: ['rosa', 'lavanda'], colors: ['rosso'] }, '2026-10-10');
    expect(describeBouquet(b, 'it')).toMatch(/ e /);
    expect(describeBouquet(b, 'it')).toContain('lavanda');
    expect(describeBouquet(b, 'en')).toMatch(/ and /);
    expect(describeBouquet(b, 'en')).toContain('lavender');
    expect(describeBouquet(b, 'en')).not.toMatch(/ e /);
  });
  it('type guards accept only known ids', () => {
    expect(isFlowerType('rosa')).toBe(true);
    expect(isFlowerType('cactus')).toBe(false);
    expect(isFlowerColor('lilla')).toBe(true);
    expect(isFlowerColor(3)).toBe(false);
    expect(colorHex(FLOWER_COLORS[0].id)).toBe(FLOWER_COLORS[0].hex);
  });
});

describe('i18n', () => {
  it('has every key, with the same placeholders, in both languages', () => {
    const keys = Object.keys(STRINGS.it).sort();
    expect(Object.keys(STRINGS.en).sort()).toEqual(keys);
    const holes = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort();
    for (const k of keys) {
      const key = k as keyof typeof STRINGS.it;
      expect(STRINGS.en[key].trim(), key).not.toBe('');
      expect(holes(STRINGS.en[key]), key).toEqual(holes(STRINGS.it[key]));
    }
  });
  it('picks Italian only for Italian devices', () => {
    expect(langFromLocale('it-IT')).toBe('it');
    expect(langFromLocale('it')).toBe('it');
    expect(langFromLocale('IT-ch')).toBe('it');
    expect(langFromLocale('en-GB')).toBe('en');
    expect(langFromLocale('de-DE')).toBe('en');
    expect(langFromLocale('items')).toBe('en');
    expect(langFromLocale(undefined)).toBe('en');
    expect(langFromLocale('')).toBe('en');
  });
  it('lets the user override the device language', () => {
    expect(resolveLang('auto', 'it-IT')).toBe('it');
    expect(resolveLang('en', 'it-IT')).toBe('en');
    expect(resolveLang('it', 'en-US')).toBe('it');
    expect(isLang('en')).toBe(true);
    expect(isLang('fr')).toBe(false);
  });
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(t('en', 'next.today', { t: '07:30' })).toBe('Next bouquet today at 07:30');
    expect(t('it', 'next.tomorrow', { t: '08:00' })).toBe('Prossimo bouquet domani alle 08:00');
    expect(t('en', 'stage.aria')).toBe('3D bouquet of {d}');
  });
  it('joins lists in each language', () => {
    expect(joinList('en', ['a', 'b', 'c'])).toBe('a, b and c');
    expect(joinList('it', ['a', 'b'])).toBe('a e b');
    expect(joinList('en', ['a'])).toBe('a');
    expect(joinList('en', [])).toBe('');
  });
  it('translates dates, greetings and labels', () => {
    expect(formatDate('2026-10-10', 'en')).toBe('Saturday 10 October');
    expect(formatDate('2026-10-10')).toBe('sabato 10 ottobre');
    expect(greetingFor('mattina', 'en')).toBe('Good morning');
    expect(greetingFor('notte', 'en')).toBe('Sweet dreams');
    expect(flowerLabel('girasole', 'en')).toBe('Sunflowers');
    expect(flowerLabel('girasole', 'it')).toBe('Girasoli');
    expect(colorLabel('lilla', 'en')).toBe('Lilac');
    expect(flowerLabel('cactus' as never, 'en')).toBe('cactus');
    expect(colorLabel('nope' as never, 'it')).toBe('nope');
    for (const f of FLOWER_TYPES) expect(f.en.length).toBeGreaterThan(0);
    for (const c of FLOWER_COLORS) expect(c.en.length).toBeGreaterThan(0);
  });
  it('English messages: same rotation guarantees, all different from the Italian ones', () => {
    expect(new Set(MESSAGES_EN).size).toBe(MESSAGES_EN.length);
    const start = dayNumber('2026-01-01');
    const seen = new Set<string>();
    let prev = '';
    for (let d = 0; d < MESSAGES_EN.length; d++) {
      const key = new Date((start + d) * 86_400_000).toISOString().slice(0, 10);
      const m = messageFor(key, 'en');
      expect(m).not.toBe(prev);
      prev = m;
      seen.add(m);
    }
    expect(seen.size).toBe(MESSAGES_EN.length);
    expect(MESSAGES_EN).not.toContain(MESSAGES[0]);
  });
});

describe('daily bouquet styles', () => {
  const dayKeys = (n: number) => {
    const start = dayNumber('2026-01-01');
    return Array.from({ length: n }, (_, d) => new Date((start + d) * 86_400_000).toISOString().slice(0, 10));
  };
  const signature = (b: ReturnType<typeof composeBouquet>) => JSON.stringify([b.style, b.featured]);

  it('offers single flower, pair and mix, each in one or more colours', () => {
    expect(availableStyles(8, 9)).toEqual([1, 2, 3, 5].flatMap((k) => [1, 2, 3].map((c) => ({ kinds: k, colors: c }))));
    expect(availableStyles(2, 1)).toEqual([{ kinds: 1, colors: 1 }, { kinds: 2, colors: 1 }]);
    expect(availableStyles(1, 1)).toEqual([{ kinds: 1, colors: 1 }]);
  });
  it('never repeats yesterday’s style, and uses every style over time', () => {
    for (const [f, c] of [[8, 9], [3, 2], [2, 1], [1, 2], [4, 4]] as const) {
      const styles = availableStyles(f, c);
      const seen = new Set<string>();
      let prev = '';
      for (const key of dayKeys(120)) {
        const s = JSON.stringify(styleForDay(styles, key, 12345));
        expect(s).not.toBe(prev);
        prev = s;
        seen.add(s);
      }
      expect(seen.size).toBe(styles.length);
    }
  });
  it('a whole year with no bouquet equal to the day before, only chosen flowers and colours', () => {
    const prefs = { flowers: ['rosa', 'tulipano', 'peonia', 'girasole'] as FlowerType[], colors: ['corallo', 'cipria', 'sole'] as FlowerColor[] };
    const allowed = new Set(prefs.colors.map(colorHex));
    let prev = '';
    const stylesSeen = new Set<string>();
    for (const key of dayKeys(365)) {
      const b = composeBouquet(prefs, key);
      expect(signature(b)).not.toBe(prev);
      prev = signature(b);
      stylesSeen.add(JSON.stringify(b.style));
      expect(b.featured.length).toBe(b.style.kinds);
      expect(new Set(b.stems.map((s) => s.type)).size).toBe(b.style.kinds);
      const used = new Set(b.stems.map((s) => s.color));
      expect(used.size).toBe(b.style.colors);
      for (const c of used) expect(allowed.has(c)).toBe(true);
    }
    expect(stylesSeen.size).toBe(availableStyles(4, 3).length);
  });
  it('single-kind days use exactly one of the chosen flowers', () => {
    const prefs = { flowers: ['rosa', 'tulipano', 'margherita'] as FlowerType[], colors: ['rosso', 'panna'] as FlowerColor[] };
    const singles = dayKeys(60).map((k) => composeBouquet(prefs, k)).filter((b) => b.style.kinds === 1);
    expect(singles.length).toBeGreaterThan(0);
    for (const b of singles) {
      expect(new Set(b.stems.map((s) => s.type)).size).toBe(1);
      expect(prefs.flowers).toContain(b.stems[0]!.type);
    }
  });
  it('lavender keeps its natural colour whatever the style', () => {
    for (const key of dayKeys(20)) {
      const b = composeBouquet({ flowers: ['lavanda'], colors: ['rosso'] }, key);
      for (const s of b.stems) expect(s.color).not.toBe('#C0283C');
    }
  });
});

describe('gift day', () => {
  const rome = 'Europe/Rome';
  const at = (h: number, m: number, day = 10) => Date.UTC(2026, 9, day, h - 2, m); // CEST
  it('changes at midnight without a notification', () => {
    expect(giftDayKey(at(0, 5), rome, null)).toBe('2026-10-10');
    expect(giftDayKey(at(23, 59), rome, null)).toBe('2026-10-10');
  });
  it('changes at the notification time when one is set', () => {
    const t = { hour: 8, minute: 30 };
    expect(giftDayKey(at(8, 29), rome, t)).toBe('2026-10-09');
    expect(giftDayKey(at(8, 30), rome, t)).toBe('2026-10-10');
    expect(giftDayKey(at(22, 0), rome, t)).toBe('2026-10-10');
  });
  it('handles month boundaries and late-night times', () => {
    expect(giftDayKey(Date.UTC(2026, 10, 1, 5, 0), rome, { hour: 9, minute: 0 })).toBe('2026-10-31');
    expect(giftDayKey(at(23, 58), rome, { hour: 23, minute: 59 })).toBe('2026-10-09');
    expect(giftDayKey(at(23, 59), rome, { hour: 23, minute: 59 })).toBe('2026-10-10');
  });
});

describe('message library', () => {
  for (const [lang, list, quotes] of [['it', MESSAGES, QUOTES_IT], ['en', MESSAGES_EN, QUOTES_EN]] as const) {
    it(`${lang}: at least 500 messages, no duplicates, short enough for a notification`, () => {
      expect(list.length).toBeGreaterThanOrEqual(500);
      expect(new Set(list).size).toBe(list.length);
      for (const m of list) {
        expect(m.trim()).toBe(m);
        expect(m.length, m).toBeLessThanOrEqual(140);
        expect(m.length, m).toBeGreaterThanOrEqual(12);
      }
    });
    it(`${lang}: every quote is quoted and attributed, and all of them are in the rotation`, () => {
      expect(quotes.length).toBeGreaterThanOrEqual(25);
      for (const q of quotes) expect(q, q).toMatch(/^[«“].+[»”] — [A-Z][\p{L}. ]+$/u);
      for (const q of quotes) expect(list).toContain(q);
    });
  }
  it('Italian messages never assume the reader’s gender', () => {
    const gendered = /\b(sei|essere|sentirti|restare)\s+(bravo|brava|pronto|pronta|stanco|stanca|solo|sola|fiero|fiera|unico|unica|bello|bella|allegro|allegra|stato|stata|coraggioso|coraggiosa|fantastico|fantastica|grato|grata|voluto|voluta|amato|amata)\b|\bte (stesso|stessa)\b|\bbentornat[oa]\b/i;
    for (const m of MESSAGES) expect(m, m).not.toMatch(gendered);
  });
  it('quotes show up regularly, not all in one stretch', () => {
    const firstQuote = MESSAGES.findIndex((m) => QUOTES_IT.includes(m));
    expect(firstQuote).toBeLessThan(30);
  });
});

describe('Italian colour agreement', () => {
  it('agrees real adjectives with the flower and leaves colour nouns alone', () => {
    expect(italianColor('rosso', 'rosa')).toBe('rosse');
    expect(italianColor('rosso', 'tulipano')).toBe('rossi');
    expect(italianColor('azzurro', 'gerbera')).toBe('azzurre');
    expect(italianColor('azzurro', 'girasole')).toBe('azzurri');
    expect(italianColor('corallo', 'rosa')).toBe('corallo');
    expect(italianColor('cipria', 'tulipano')).toBe('rosa cipria');
    expect(italianColor('panna', 'margherita')).toBe('bianco panna');
  });
  it('never writes a masculine-singular colour after a plural flower', () => {
    for (const f of FLOWER_TYPES) {
      for (const c of FLOWER_COLORS) {
        const d = describeBouquet({ featured: [{ type: f.id, color: c.id }] }, 'it');
        expect(d, d).not.toMatch(/ (rosso|azzurro)$/);
      }
    }
    expect(describeBouquet({ featured: [{ type: 'rosa', color: 'rosso' }] }, 'it')).toBe('rose rosse');
  });
});
