import { dayNumber } from './dates';
import type { Lang } from './i18n';
import { ORIGINALS_EN, QUOTES_EN } from './content/messages-en';
import { ORIGINALS_IT, QUOTES_IT } from './content/messages-it';

/**
 * Daily messages: originals written for Daily Smile plus public-domain quotes (author after
 * " — "). Quotes are spread through the year by the rotation below, not bunched together.
 */
export const MESSAGES: readonly string[] = interleave(ORIGINALS_IT, QUOTES_IT);
export const MESSAGES_EN: readonly string[] = interleave(ORIGINALS_EN, QUOTES_EN);

/** One quote roughly every (originals / quotes) messages, in list order. */
function interleave(originals: readonly string[], quotes: readonly string[]): string[] {
  const out: string[] = [];
  const every = Math.max(1, Math.floor(originals.length / Math.max(1, quotes.length)));
  let q = 0;
  originals.forEach((m, i) => {
    out.push(m);
    if ((i + 1) % every === 0 && q < quotes.length) out.push(quotes[q++] as string);
  });
  while (q < quotes.length) out.push(quotes[q++] as string);
  return out;
}

/**
 * Message of the day for a "YYYY-MM-DD" key. Walks the list with a stride coprime
 * to its length, so consecutive days never repeat and all messages are used
 * before any comes back.
 */
export function messageFor(dateKey: string, lang: Lang = 'it'): string {
  const list = lang === 'en' ? MESSAGES_EN : MESSAGES;
  const n = list.length;
  const stride = coprimeStride(n);
  const index = (((dayNumber(dateKey) * stride) % n) + n) % n;
  return list[index] as string;
}

function coprimeStride(n: number): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  for (let s = 17; s < n + 17; s++) if (gcd(s, n) === 1) return s;
  return 1;
}
