import { buildPushPayload, type VapidKeys } from '@block65/webcrypto-web-push';
import { dateKey } from '../../shared/dates';
import { isLang, t } from '../../shared/i18n';
import { messageFor } from '../../shared/messages';
import { nextSendAt, parseTime } from '../../shared/schedule';
import { parseSubscribeBody, parseUnsubscribeBody, type StoredSubscription } from './validate';

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  SUBSCRIBE_LIMITER?: RateLimit;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

interface Row {
  endpoint: string;
  p256dh: string;
  auth: string;
  time: string;
  time_zone: string;
  lang: string;
  next_send_at: number;
  failures: number;
}

/** Sends one push; returns the HTTP status from the push service. */
export type Sender = (sub: StoredSubscription, payload: { title: string; body: string; url: string }, env: Env) => Promise<number>;

export const webPushSender: Sender = async (sub, payload, env) => {
  const vapid: VapidKeys = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const req = await buildPushPayload(
    { data: payload, options: { ttl: 6 * 60 * 60, urgency: 'normal', topic: 'daily-smile' } },
    { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    vapid,
  );
  const res = await fetch(sub.endpoint, req);
  return res.status;
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const MAX_BODY = 4096;

async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_BODY) return null;
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Rate-limit key: the IPv4 address, or the /64 prefix for IPv6 (one host usually owns a whole /64). */
export function clientKey(ip: string | null): string {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  const [head = '', tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

/** Push-service answers meaning the subscription itself is invalid and will never work. */
const PERMANENT = new Set([400, 403, 404, 410, 413]);
/** Consecutive transient failures (network, crypto, other 4xx) before a subscription is dropped. */
export const MAX_FAILURES = 3;

export async function handleApi(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/vapid-public-key' && request.method === 'GET') {
    return new Response(env.VAPID_PUBLIC_KEY, { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=300' } });
  }
  if (url.pathname === '/api/subscribe') {
    // Fail closed: without the limiter anyone could burn the free D1 write quota.
    if (!env.SUBSCRIBE_LIMITER) return json({ error: 'Temporarily unavailable' }, 503);
    const { success } = await env.SUBSCRIBE_LIMITER.limit({ key: clientKey(request.headers.get('cf-connecting-ip')) });
    if (!success) return json({ error: 'Too many requests' }, 429);
    // JSON only: a cross-site "simple" request (text/plain) would let any page subscribe through its visitors.
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return json({ error: 'Content-Type must be application/json' }, 415);
    }
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_BODY) return json({ error: 'Body too large' }, 413);
  }
  if (url.pathname === '/api/subscribe' && request.method === 'POST') {
    const parsed = parseSubscribeBody(await readJson(request));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const s = parsed.value;
    const next = nextSendAt(now, parseTime(s.time)!, s.timeZone);
    await env.DB.prepare(
      `INSERT INTO subscriptions (endpoint, p256dh, auth, time, time_zone, next_send_at, created_at, lang)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, time = ?4, time_zone = ?5, next_send_at = ?6, failures = 0, lang = ?8`,
    )
      .bind(s.endpoint, s.p256dh, s.auth, s.time, s.timeZone, next, now, s.lang)
      .run();
    return json({ ok: true, nextSendAt: next });
  }
  if (url.pathname === '/api/subscribe' && request.method === 'DELETE') {
    const parsed = parseUnsubscribeBody(await readJson(request));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?1').bind(parsed.value).run();
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}

/**
 * Workers Free allows ~10 ms CPU per invocation and each push costs ~3 ms (encryption plus a VAPID
 * signature), so a run sends at most this many. The rest stay due and go out a minute later
 * (3/min ≈ 4,300 notifications a day; raise it on the Paid plan).
 */
export const PUSH_BATCH = 3;

/** Cron: deliver every notification that is due, then plan the next one. */
export async function sendDue(env: Env, now = Date.now(), send: Sender = webPushSender, batch = PUSH_BATCH): Promise<{ sent: number; removed: number; failed: number }> {
  const { results } = await env.DB.prepare('SELECT endpoint, p256dh, auth, time, time_zone, next_send_at, failures, lang FROM subscriptions WHERE next_send_at <= ?1 ORDER BY next_send_at LIMIT ?2')
    .bind(now, batch)
    .all<Row>();
  let sent = 0;
  let removed = 0;
  let failed = 0;
  for (const row of results) {
    const lang = isLang(row.lang) ? row.lang : 'it';
    const sub: StoredSubscription = { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth, time: row.time, timeZone: row.time_zone, lang };
    // The scheduled day, not the delivery minute: a run that slips past midnight still matches the app.
    const body = messageFor(dateKey(row.next_send_at, row.time_zone), lang);
    let status: number;
    try {
      status = await send(sub, { title: t(lang, 'notif.title'), body, url: '/' }, env);
    } catch {
      status = 0;
    }
    const ok = status >= 200 && status < 300;
    // Server-side trouble (429, 5xx) is not the subscription's fault; everything else counts against it.
    const transient = status === 429 || status >= 500;
    const failures = ok || transient ? 0 : (row.failures ?? 0) + 1;
    if (PERMANENT.has(status) || failures >= MAX_FAILURES) {
      // Dropped by the browser, rejected by the push service, or broken for days: forget it.
      await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?1').bind(row.endpoint).run();
      removed++;
      continue;
    }
    if (ok) sent++;
    else failed++;
    // Plan tomorrow either way: a failed day is skipped rather than retried every minute.
    const next = nextSendAt(now, parseTime(row.time)!, row.time_zone);
    await env.DB.prepare('UPDATE subscriptions SET next_send_at = ?1, failures = ?2 WHERE endpoint = ?3').bind(next, failures, row.endpoint).run();
  }
  return { sent, removed, failed };
}
