import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_FAILURES, PUSH_BATCH, clientKey, handleApi, sendDue, webPushSender, type Env, type Sender } from '../src/app';
import worker from '../src/index';
import { isAllowedEndpoint, parseSubscribeBody } from '../src/validate';
import { MESSAGES_EN, messageFor } from '../../shared/messages';

/** Minimal D1 stand-in backed by a real SQLite database, so the SQL itself is exercised. */
function fakeD1(): D1Database {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    // D1 numbers its parameters ?1..?n; node:sqlite understands the same syntax.
    const stmt = {
      bind(...args: unknown[]) {
        params = args;
        return stmt;
      },
      async run() {
        db.prepare(sql).run(...(params as never[]));
        return { success: true };
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...(params as never[])) as T[] };
      },
    };
    return stmt;
  };
  return { prepare } as unknown as D1Database;
}

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const body = (over: Record<string, unknown> = {}) => ({
  subscription: { endpoint: ENDPOINT, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } },
  time: '08:00',
  timeZone: 'Europe/Rome',
  ...over,
});
const req = (method: string, path: string, data?: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  new Request(`https://daily-smile.example${path}`, { method, headers, body: data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data) });
const allowAll = { limit: async () => ({ success: true }) } as unknown as RateLimit;

let env: Env;
beforeEach(() => {
  env = { DB: fakeD1(), SUBSCRIBE_LIMITER: allowAll, VAPID_PUBLIC_KEY: 'PUBKEY', VAPID_PRIVATE_KEY: 'PRIV', VAPID_SUBJECT: 'mailto:test@example.com' };
});

describe('entry module', () => {
  it('exports only the handler (workerd rejects any other named export)', async () => {
    expect(Object.keys(await import('../src/index'))).toEqual(['default']);
  });
});

describe('endpoint allow-list', () => {
  it('accepts the real push services', () => {
    for (const ok of [ENDPOINT, 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/abc', 'https://wns2-par02p.notify.windows.com/w/?token=x']) {
      expect(isAllowedEndpoint(ok)).toBe(true);
    }
  });
  it('rejects anything that would let the worker call arbitrary hosts', () => {
    for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'notaurl', 42, `https://fcm.googleapis.com/${'a'.repeat(1100)}`]) {
      expect(isAllowedEndpoint(bad)).toBe(false);
    }
  });
});

describe('subscribe validation', () => {
  it.each([
    ['no object', null, /JSON object/],
    ['no subscription', { time: '08:00' }, /subscription/],
    ['bad p256dh', body({ subscription: { endpoint: ENDPOINT, keys: { p256dh: 'not base64!', auth: 'abc' } } }), /p256dh/],
    ['short p256dh (64 bytes)', body({ subscription: { endpoint: ENDPOINT, keys: { p256dh: 'B'.repeat(85), auth: 'tBHItJI5svbpez7KI4CCXg' } } }), /p256dh/],
    ['p256dh not an uncompressed point', body({ subscription: { endpoint: ENDPOINT, keys: { p256dh: 'A'.repeat(87), auth: 'tBHItJI5svbpez7KI4CCXg' } } }), /p256dh/],
    ['bad auth', body({ subscription: { endpoint: ENDPOINT, keys: { p256dh: body().subscription.keys.p256dh, auth: '' } } }), /auth/],
    ['auth of the wrong size', body({ subscription: { endpoint: ENDPOINT, keys: { p256dh: body().subscription.keys.p256dh, auth: 'abcd' } } }), /auth/],
    ['bad time', body({ time: '8am' }), /HH:MM/],
    ['bad zone', body({ timeZone: 'Nowhere/Land' }), /timeZone/],
    ['unknown lang', body({ lang: 'fr' }), /lang/],
  ])('rejects %s', (_name, input, error) => {
    const r = parseSubscribeBody(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(error);
  });
});

describe('API', () => {
  it('serves the VAPID public key', async () => {
    const res = await handleApi(req('GET', '/api/vapid-public-key'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('PUBKEY');
  });
  it('stores a subscription with the next local send time and updates it on re-subscribe', async () => {
    const now = Date.UTC(2026, 9, 10, 5, 0); // 07:00 Rome
    const res = await handleApi(req('POST', '/api/subscribe', body()), env, now);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, nextSendAt: Date.UTC(2026, 9, 10, 6, 0) });

    const again = await handleApi(req('POST', '/api/subscribe', body({ time: '21:30' })), env, now);
    expect(((await again.json()) as { nextSendAt: number }).nextSendAt).toBe(Date.UTC(2026, 9, 10, 19, 30));
    const { results } = await env.DB.prepare('SELECT time FROM subscriptions').all<{ time: string }>();
    expect(results).toEqual([{ time: '21:30' }]);
  });
  it('returns 400 for invalid or oversized JSON', async () => {
    expect((await handleApi(req('POST', '/api/subscribe', '{oops'), env)).status).toBe(400);
    expect((await handleApi(req('POST', '/api/subscribe', 'x'.repeat(5000)), env)).status).toBe(400);
    expect((await handleApi(req('POST', '/api/subscribe', body({ timeZone: 'Bad/Zone' })), env)).status).toBe(400);
  });
  it('unsubscribes', async () => {
    await handleApi(req('POST', '/api/subscribe', body()), env);
    expect((await handleApi(req('DELETE', '/api/subscribe', { endpoint: ENDPOINT }), env)).status).toBe(200);
    expect((await env.DB.prepare('SELECT * FROM subscriptions').all()).results).toHaveLength(0);
    expect((await handleApi(req('DELETE', '/api/subscribe', { endpoint: 'https://evil.example' }), env)).status).toBe(400);
  });
  it('rate-limits subscribe calls per IP', async () => {
    const seen: string[] = [];
    let calls = 0;
    const limited: Env = { ...env, SUBSCRIBE_LIMITER: { limit: async ({ key }: { key: string }) => (seen.push(key), { success: ++calls <= 1 }) } as RateLimit };
    const withIp = (data: unknown) => new Request('https://daily-smile.example/api/subscribe', { method: 'POST', body: JSON.stringify(data), headers: { 'cf-connecting-ip': '203.0.113.7', 'content-type': 'application/json' } });
    expect((await handleApi(withIp(body()), limited)).status).toBe(200);
    expect((await handleApi(withIp(body()), limited)).status).toBe(429);
    expect(seen).toEqual(['203.0.113.7', '203.0.113.7']);
    expect((await handleApi(req('GET', '/api/vapid-public-key'), limited)).status).toBe(200); // key endpoint is not limited
  });
  it('fails closed without the rate limiter', async () => {
    const { SUBSCRIBE_LIMITER: _drop, ...noLimiter } = env;
    expect((await handleApi(req('POST', '/api/subscribe', body()), noLimiter as Env)).status).toBe(503);
  });
  it('rejects non-JSON content types, so other sites cannot subscribe through their visitors', async () => {
    expect((await handleApi(req('POST', '/api/subscribe', body(), { 'content-type': 'text/plain' }), env)).status).toBe(415);
    expect((await handleApi(req('POST', '/api/subscribe', body(), {}), env)).status).toBe(415);
  });
  it('refuses declared oversized bodies before reading them', async () => {
    const r = req('POST', '/api/subscribe', body(), { 'content-type': 'application/json', 'content-length': '999999' });
    expect((await handleApi(r, env)).status).toBe(413);
  });
  it('keys IPv6 clients on their /64 and IPv4 on the address', () => {
    expect(clientKey('203.0.113.7')).toBe('203.0.113.7');
    expect(clientKey('2001:db8:abcd:12:1:2:3:4')).toBe('2001:db8:abcd:12::/64');
    expect(clientKey('2001:db8:abcd:12::99')).toBe('2001:db8:abcd:12::/64');
    expect(clientKey('2001:0DB8::1')).toBe('2001:db8:0:0::/64');
    expect(clientKey(null)).toBe('unknown');
  });
  it('404s unknown routes and methods', async () => {
    expect((await handleApi(req('GET', '/api/nope'), env)).status).toBe(404);
    expect((await handleApi(req('PUT', '/api/subscribe', body()), env)).status).toBe(404);
  });
  it('routes /api to the handler and everything else to static assets', async () => {
    const assets = { fetch: vi.fn(async () => new Response('index')) } as unknown as Fetcher;
    expect(await (await worker.fetch!(req('GET', '/api/vapid-public-key') as never, { ...env, ASSETS: assets })).text()).toBe('PUBKEY');
    expect(await (await worker.fetch!(req('GET', '/') as never, { ...env, ASSETS: assets })).text()).toBe('index');
    expect((await worker.fetch!(req('GET', '/') as never, env)).status).toBe(404);
  });
});

describe('language', () => {
  it('defaults to Italian for older clients and stores the chosen language', async () => {
    expect(parseSubscribeBody(body())).toMatchObject({ ok: true, value: { lang: 'it' } });
    await handleApi(req('POST', '/api/subscribe', body({ lang: 'en' })), env);
    const { results } = await env.DB.prepare('SELECT lang FROM subscriptions').all<{ lang: string }>();
    expect(results).toEqual([{ lang: 'en' }]);
  });
  it('sends the notification in the subscriber’s language', async () => {
    const at0700 = Date.UTC(2026, 9, 10, 5, 0);
    const keys = body().subscription.keys;
    await handleApi(req('POST', '/api/subscribe', body({ lang: 'en' })), env, at0700);
    await handleApi(req('POST', '/api/subscribe', body({ subscription: { endpoint: `${ENDPOINT}-it`, keys } })), env, at0700);
    const send = vi.fn<Sender>(async () => 201);
    await sendDue(env, Date.UTC(2026, 9, 10, 6, 1), send);
    const byEndpoint = Object.fromEntries(send.mock.calls.map(([s, p]) => [s.endpoint, p]));
    expect(byEndpoint[ENDPOINT]!.title).toBe('Your bouquet for today has arrived');
    expect(MESSAGES_EN).toContain(byEndpoint[ENDPOINT]!.body);
    expect(byEndpoint[`${ENDPOINT}-it`]!.title).toBe('Il tuo bouquet di oggi è arrivato');
  });
});

describe('daily delivery (cron)', () => {
  const at0700 = Date.UTC(2026, 9, 10, 5, 0);
  const at0801 = Date.UTC(2026, 9, 10, 6, 1);

  it('sends only what is due, with the message of the user’s local day, then plans tomorrow', async () => {
    await handleApi(req('POST', '/api/subscribe', body()), env, at0700);
    const send = vi.fn<Sender>(async () => 201);

    expect(await sendDue(env, at0700, send)).toEqual({ sent: 0, removed: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();

    expect(await sendDue(env, at0801, send)).toEqual({ sent: 1, removed: 0, failed: 0 });
    const payload = send.mock.calls[0]![1];
    expect(payload.title).toMatch(/bouquet/);
    expect(payload.body.length).toBeGreaterThan(10);

    const { results } = await env.DB.prepare('SELECT next_send_at FROM subscriptions').all<{ next_send_at: number }>();
    expect(results[0]!.next_send_at).toBe(Date.UTC(2026, 9, 11, 6, 0));
    expect(await sendDue(env, at0801 + 60_000, send)).toEqual({ sent: 0, removed: 0, failed: 0 });
  });
  it('a run delayed past midnight still sends the message of the scheduled day', async () => {
    await handleApi(req('POST', '/api/subscribe', body({ time: '23:59' })), env, Date.UTC(2026, 9, 10, 20, 0));
    const send = vi.fn<Sender>(async () => 201);
    await sendDue(env, Date.UTC(2026, 9, 10, 22, 3), send); // 00:03 on the 11th in Rome
    expect(send.mock.calls[0]![1].body).toBe(messageFor('2026-10-10', 'it'));
  });
  it('forgets subscriptions the push service reports as gone', async () => {
    await handleApi(req('POST', '/api/subscribe', body()), env, at0700);
    expect(await sendDue(env, at0801, async () => 410)).toEqual({ sent: 0, removed: 1, failed: 0 });
    expect((await env.DB.prepare('SELECT * FROM subscriptions').all()).results).toHaveLength(0);
  });
  it('drops subscriptions the push service rejects as invalid', async () => {
    await handleApi(req('POST', '/api/subscribe', body()), env, at0700);
    expect(await sendDue(env, at0801, async () => 403)).toEqual({ sent: 0, removed: 1, failed: 0 });
  });
  it('drops a subscription after repeated transient failures, but keeps it through server outages', async () => {
    await handleApi(req('POST', '/api/subscribe', body()), env, at0700);
    const day = 86_400_000;
    const rows = async () => (await env.DB.prepare('SELECT failures FROM subscriptions').all<{ failures: number }>()).results;
    // Push service down (5xx/429): never counted.
    expect(await sendDue(env, at0801, async () => 503)).toEqual({ sent: 0, removed: 0, failed: 1 });
    expect(await sendDue(env, at0801 + day, async () => 429)).toEqual({ sent: 0, removed: 0, failed: 1 });
    expect(await rows()).toEqual([{ failures: 0 }]);
    // Network/crypto errors: counted, success resets, third in a row deletes.
    const boom = async (): Promise<number> => {
      throw new Error('dns');
    };
    await sendDue(env, at0801 + 2 * day, boom);
    await sendDue(env, at0801 + 3 * day, boom);
    expect(await rows()).toEqual([{ failures: 2 }]);
    await sendDue(env, at0801 + 4 * day, async () => 201);
    expect(await rows()).toEqual([{ failures: 0 }]);
    await sendDue(env, at0801 + 5 * day, boom);
    await sendDue(env, at0801 + 6 * day, boom);
    expect(await sendDue(env, at0801 + 7 * day, boom)).toEqual({ sent: 0, removed: 1, failed: 0 });
    expect(MAX_FAILURES).toBe(3);
  });
  it('counts errors and network failures but still plans the next day', async () => {
    await handleApi(req('POST', '/api/subscribe', body()), env, at0700);
    await handleApi(req('POST', '/api/subscribe', body({ subscription: { endpoint: `${ENDPOINT}x`, keys: body().subscription.keys } })), env, at0700);
    let n = 0;
    const flaky: Sender = async () => {
      if (n++ === 0) throw new Error('network');
      return 500;
    };
    expect(await sendDue(env, at0801, flaky)).toEqual({ sent: 0, removed: 0, failed: 2 });
    const { results } = await env.DB.prepare('SELECT next_send_at FROM subscriptions').all<{ next_send_at: number }>();
    expect(results.every((r) => r.next_send_at > at0801)).toBe(true);
  });
  it('stays inside the Free-plan CPU budget per run and sends the rest on the next runs', async () => {
    const keys = body().subscription.keys;
    for (let i = 0; i < PUSH_BATCH + 2; i++) {
      await handleApi(req('POST', '/api/subscribe', body({ subscription: { endpoint: `${ENDPOINT}-${i}`, keys } })), env, at0700);
    }
    const send = vi.fn<Sender>(async () => 201);
    expect(await sendDue(env, at0801, send)).toEqual({ sent: PUSH_BATCH, removed: 0, failed: 0 });
    expect(PUSH_BATCH * 3).toBeLessThanOrEqual(10); // ~3 ms CPU per push, 10 ms per invocation
    expect(await sendDue(env, at0801 + 60_000, send)).toEqual({ sent: 2, removed: 0, failed: 0 });
  });
  it('scheduled() runs the delivery through waitUntil', async () => {
    const waits: Promise<unknown>[] = [];
    await worker.scheduled!({} as ScheduledController, env, { waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as ExecutionContext);
    expect(waits).toHaveLength(1);
    await waits[0];
  });
});

describe('webPushSender', () => {
  it('encrypts the payload (aes128gcm) and signs it with VAPID before calling the push service', async () => {
    const b64url = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('base64url');
    const server = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const client = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const realEnv: Env = {
      ...env,
      VAPID_PUBLIC_KEY: b64url(await crypto.subtle.exportKey('raw', (server as CryptoKeyPair).publicKey) as ArrayBuffer),
      VAPID_PRIVATE_KEY: ((await crypto.subtle.exportKey('jwk', (server as CryptoKeyPair).privateKey)) as JsonWebKey).d!,
    };
    const sub = {
      endpoint: ENDPOINT,
      p256dh: b64url(await crypto.subtle.exportKey('raw', (client as CryptoKeyPair).publicKey) as ArrayBuffer),
      auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
      time: '08:00',
      timeZone: 'Europe/Rome',
      lang: 'it' as const,
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 201 }));
    try {
      expect(await webPushSender(sub, { title: 't', body: 'b', url: '/' }, realEnv)).toBe(201);
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(url).toBe(ENDPOINT);
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get('content-encoding')).toBe('aes128gcm');
      expect(headers.get('authorization')).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
      expect(headers.get('ttl')).toBe(String(6 * 60 * 60));
      // High urgency: Android otherwise holds the push in Doze until the device wakes up.
      expect(headers.get('urgency')).toBe('high');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
