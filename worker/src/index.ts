import { buildPushPayload, type VapidKeys } from '@block65/webcrypto-web-push';
import { dateKey } from '../../shared/dates';
import { messageFor } from '../../shared/messages';
import { nextSendAt, parseTime } from '../../shared/schedule';
import { parseSubscribeBody, parseUnsubscribeBody, type StoredSubscription } from './validate';

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
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
  next_send_at: number;
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

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 4096) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function handleApi(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/vapid-public-key' && request.method === 'GET') {
    return new Response(env.VAPID_PUBLIC_KEY, { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=3600' } });
  }
  if (url.pathname === '/api/subscribe' && request.method === 'POST') {
    const parsed = parseSubscribeBody(await readJson(request));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const s = parsed.value;
    const next = nextSendAt(now, parseTime(s.time)!, s.timeZone);
    await env.DB.prepare(
      `INSERT INTO subscriptions (endpoint, p256dh, auth, time, time_zone, next_send_at, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, time = ?4, time_zone = ?5, next_send_at = ?6`,
    )
      .bind(s.endpoint, s.p256dh, s.auth, s.time, s.timeZone, next, now)
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

/** Cron: deliver every notification that is due, then plan the next one. */
export async function sendDue(env: Env, now = Date.now(), send: Sender = webPushSender, batch = 200): Promise<{ sent: number; removed: number; failed: number }> {
  const { results } = await env.DB.prepare('SELECT endpoint, p256dh, auth, time, time_zone, next_send_at FROM subscriptions WHERE next_send_at <= ?1 ORDER BY next_send_at LIMIT ?2')
    .bind(now, batch)
    .all<Row>();
  let sent = 0;
  let removed = 0;
  let failed = 0;
  for (const row of results) {
    const sub: StoredSubscription = { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth, time: row.time, timeZone: row.time_zone };
    const body = messageFor(dateKey(now, row.time_zone));
    let status: number;
    try {
      status = await send(sub, { title: 'Il tuo bouquet di oggi è arrivato', body, url: '/' }, env);
    } catch {
      status = 0;
    }
    if (status === 404 || status === 410) {
      // The browser dropped this subscription: forget it.
      await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?1').bind(row.endpoint).run();
      removed++;
      continue;
    }
    if (status >= 200 && status < 300) sent++;
    else failed++;
    // Plan tomorrow either way: a failed day is skipped rather than retried every minute.
    const next = nextSendAt(now, parseTime(row.time)!, row.time_zone);
    await env.DB.prepare('UPDATE subscriptions SET next_send_at = ?1 WHERE endpoint = ?2').bind(next, row.endpoint).run();
  }
  return { sent, removed, failed };
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(sendDue(env).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
