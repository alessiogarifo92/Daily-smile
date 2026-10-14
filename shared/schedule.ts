import { isValidTimeZone, localParts } from './dates';

export interface TimeOfDay {
  hour: number;
  minute: number;
}

/** Parses "HH:MM" (24h). Returns null for anything else. */
export function parseTime(value: unknown): TimeOfDay | null {
  if (typeof value !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function formatTime(t: TimeOfDay): string {
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

/** Offset (ms) of the zone from UTC at a given instant: local wall clock minus UTC. */
function zoneOffset(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(ms / 60_000) * 60_000;
}

/** UTC instant of a local wall-clock time in a zone (DST gaps resolve forward). */
export function zonedToUtc(year: number, month: number, day: number, t: TimeOfDay, tz: string): number {
  const guess = Date.UTC(year, month - 1, day, t.hour, t.minute);
  let utc = guess - zoneOffset(guess, tz);
  const second = guess - zoneOffset(utc, tz);
  if (second !== utc) utc = Math.max(utc, second);
  return utc;
}

/**
 * Next instant strictly after `nowMs` at which the local clock in `tz` reads `time`.
 * Used to plan the daily notification.
 */
export function nextSendAt(nowMs: number, time: TimeOfDay, tz: string): number {
  if (!isValidTimeZone(tz)) throw new Error(`Invalid time zone: ${tz}`);
  const today = localParts(nowMs, tz);
  for (let offset = 0; offset <= 2; offset++) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const at = zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), time, tz);
    if (at > nowMs) return at;
  }
  throw new Error('Unreachable: no send time found within two days');
}
