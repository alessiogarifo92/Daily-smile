import { formatTime, type TimeOfDay } from '../../shared/schedule';

/** Keeps only digits, at most two: what the hour/minute boxes accept while typing. */
export function cleanDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 2);
}

/**
 * Turns what was typed in the two boxes into a valid time, or null when a box is empty.
 * Out-of-range values are clamped ("25" → 23, "75" → 59) rather than rejected.
 */
export function partsToTime(hours: string, minutes: string): TimeOfDay | null {
  const h = cleanDigits(hours);
  const m = cleanDigits(minutes);
  if (h === '' || m === '') return null;
  return { hour: Math.min(23, Number(h)), minute: Math.min(59, Number(m)) };
}

/** The two boxes' text for a time: ["08", "05"]. */
export function timeToParts(t: TimeOfDay): [string, string] {
  const [h, m] = formatTime(t).split(':');
  return [h as string, m as string];
}

/** Moves a time by `delta` minutes, wrapping around midnight. */
export function shiftTime(t: TimeOfDay, delta: number): TimeOfDay {
  const total = (((t.hour * 60 + t.minute + delta) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

/** After this many digits the hour box is complete and focus can jump to minutes. */
export function hourComplete(raw: string): boolean {
  const h = cleanDigits(raw);
  return h.length === 2 || (h.length === 1 && Number(h) > 2);
}
