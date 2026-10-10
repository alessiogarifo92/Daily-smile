import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { PUSH_BATCH, handleApi, sendDue, webPushSender, type Env, type Sender } from '../src/index';
import { isAllowedEndpoint, parseSubscribeBody } from '../src/validate';

/** Minimal D1 stand-in backed by a real SQLite database, so the SQL itself is exercised. */
function fakeD1(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
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
const req = (method: string, path: string, data?: unknown) =>
  new Request(`https://daily-smile.example${path}`, { method, body: data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data) });

let env: Env;
beforeEach(() => {
  env = { DB: fakeD1(), VAPID_PUBLIC_KEY: 'PUBKEY', VAPID_PRIVATE_KEY: 'PRIV', VAPID_SUBJECT: 'mailto:test@example.com' };
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
    ['bad auth', body({ subscription: { endpoint: ENDPOINT, keys: { p256dh: 'abc', auth: '' } } }), /auth/],
    ['bad time', body({ time: '8am' }), /HH:MM/],
    ['bad zone', body({ timeZone: 'Nowhere/Land' }), /timeZone/],
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
    const withIp = (data: unknown) => new Request('https://daily-smile.example/api/subscribe', { method: 'POST', body: JSON.stringify(data), headers: { 'cf-connecting-ip': '203.0.113.7' } });
    expect((await handleApi(withIp(body()), limited)).status).toBe(200);
    expect((await handleApi(withIp(body()), limited)).status).toBe(429);
    expect(seen).toEqual(['203.0.113.7', '203.0.113.7']);
    expect((await handleApi(req('GET', '/api/vapid-public-key'), limited)).status).toBe(200); // key endpoint is not limited
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
  it('forgets subscriptions the push service reports as gone', async () => {
    await handleApi(req('POST', '/api/subscribe', body()), env, at0700);
    expect(await sendDue(env, at0801, async () => 410)).toEqual({ sent: 0, removed: 1, failed: 0 });
    expect((await env.DB.prepare('SELECT * FROM subscriptions').all()).results).toHaveLength(0);
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
  it('stays under the Free-plan subrequest cap and sends the rest on the next run', async () => {
    const keys = body().subscription.keys;
    for (let i = 0; i < PUSH_BATCH + 5; i++) {
      await handleApi(req('POST', '/api/subscribe', body({ subscription: { endpoint: `${ENDPOINT}-${i}`, keys } })), env, at0700);
    }
    const send = vi.fn<Sender>(async () => 201);
    expect(await sendDue(env, at0801, send)).toEqual({ sent: PUSH_BATCH, removed: 0, failed: 0 });
    expect(PUSH_BATCH).toBeLessThan(50);
    expect(await sendDue(env, at0801 + 60_000, send)).toEqual({ sent: 5, removed: 0, failed: 0 });
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
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
