import { isValidTimeZone } from '../../shared/dates';
import { isLang, type Lang } from '../../shared/i18n';
import { formatTime, parseTime } from '../../shared/schedule';

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  time: string;
  timeZone: string;
  lang: Lang;
}

/**
 * Push services the worker is willing to call. Accepting any URL would let anyone
 * make the worker send requests to arbitrary hosts.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

export function isAllowedEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1024) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && url.username === '' && url.port === '' && PUSH_HOSTS.some((re) => re.test(url.hostname));
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function b64urlLength(value: string): number {
  const clean = value.replace(/=+$/, '');
  return Math.floor((clean.length * 3) / 4);
}

/** Decoded first byte of a base64url string. */
function firstByte(value: string): number {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return (c.indexOf(value[0] ?? '') << 2) | (c.indexOf(value[1] ?? '') >> 4);
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseSubscribeBody(body: unknown): Result<StoredSubscription> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const sub = b.subscription as Record<string, unknown> | undefined;
  if (typeof sub !== 'object' || sub === null) return { ok: false, error: 'Missing subscription' };
  if (!isAllowedEndpoint(sub.endpoint)) return { ok: false, error: 'Endpoint is not a known push service' };
  const keys = sub.keys as Record<string, unknown> | undefined;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  // p256dh: an uncompressed P-256 point (65 bytes, 0x04 prefix); auth: a 16-byte secret.
  if (typeof p256dh !== 'string' || p256dh.length > 100 || !B64URL.test(p256dh) || b64urlLength(p256dh) !== 65 || firstByte(p256dh) !== 4) {
    return { ok: false, error: 'Invalid p256dh key' };
  }
  if (typeof auth !== 'string' || auth.length > 30 || !B64URL.test(auth) || b64urlLength(auth) !== 16) return { ok: false, error: 'Invalid auth key' };
  const time = parseTime(b.time);
  if (!time) return { ok: false, error: 'time must be HH:MM' };
  if (typeof b.timeZone !== 'string' || !isValidTimeZone(b.timeZone)) return { ok: false, error: 'Invalid timeZone' };
  // Optional for older clients, which were Italian-only.
  if (b.lang !== undefined && !isLang(b.lang)) return { ok: false, error: 'Invalid lang' };
  const lang: Lang = isLang(b.lang) ? b.lang : 'it';
  return { ok: true, value: { endpoint: sub.endpoint as string, p256dh, auth, time: formatTime(time), timeZone: b.timeZone, lang } };
}

export function parseUnsubscribeBody(body: unknown): Result<string> {
  const endpoint = (body as Record<string, unknown> | null)?.endpoint;
  if (!isAllowedEndpoint(endpoint)) return { ok: false, error: 'Invalid endpoint' };
  return { ok: true, value: endpoint };
}
