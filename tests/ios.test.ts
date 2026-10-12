import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { pushSupport } from '../web/src/push';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

type Env = { ua: string; platform?: string; touch?: number; standalone?: boolean; displayStandalone?: boolean; push?: boolean };

function env({ ua, platform = 'iPhone', touch = 5, standalone, displayStandalone = false, push = true }: Env) {
  const nav: Record<string, unknown> = { userAgent: ua, platform, maxTouchPoints: touch };
  if (standalone !== undefined) nav.standalone = standalone;
  if (push) nav.serviceWorker = {};
  const win: Record<string, unknown> = { matchMedia: () => ({ matches: displayStandalone }) };
  if (push) Object.assign(win, { PushManager: {}, Notification: {} });
  return [nav as unknown as Navigator, win as unknown as Window] as const;
}

describe('pushSupport on iPhone and iPad', () => {
  it('asks Safari-tab users on iPhone to add the app to the Home Screen', () => {
    // Safari in a tab has no PushManager at all: it must read as "install", not "unsupported".
    expect(pushSupport(...env({ ua: IPHONE, standalone: false, push: false }))).toBe('needs-install');
  });

  it('offers push once opened from the Home Screen (navigator.standalone)', () => {
    expect(pushSupport(...env({ ua: IPHONE, standalone: true }))).toBe('supported');
  });

  it('offers push when the display mode is standalone', () => {
    expect(pushSupport(...env({ ua: IPHONE, displayStandalone: true }))).toBe('supported');
  });

  it('spots an iPad that reports a desktop Mac user agent', () => {
    expect(pushSupport(...env({ ua: IPAD_DESKTOP_UA, platform: 'MacIntel', touch: 5, push: false }))).toBe('needs-install');
  });

  it('does not mistake a real Mac (no touch) for an iPad', () => {
    expect(pushSupport(...env({ ua: IPAD_DESKTOP_UA, platform: 'MacIntel', touch: 0 }))).toBe('supported');
  });

  it('reports an installed iOS older than 16.4 (no PushManager) as unsupported', () => {
    expect(pushSupport(...env({ ua: IPHONE, standalone: true, push: false }))).toBe('unsupported');
  });

  it('survives a browser without matchMedia', () => {
    const [nav, win] = env({ ua: ANDROID, platform: 'Linux' });
    delete (win as unknown as Record<string, unknown>).matchMedia;
    expect(pushSupport(nav, win)).toBe('supported');
  });
});

type Handler = (event: unknown) => void;

/** Loads web/public/sw.js with a fake worker scope and returns its notificationclick handler. */
function loadWorker(windows: unknown[]) {
  const handlers: Record<string, Handler> = {};
  const clients = { matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => null), claim: vi.fn() };
  const self = {
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    location: { origin: 'https://daily.example' },
    clients,
    registration: {},
    skipWaiting: () => {},
  };
  runInNewContext(readFileSync('web/public/sw.js', 'utf8'), { self, caches: {}, fetch: () => {}, URL });
  const click = async (url?: string) => {
    let done: Promise<unknown> = Promise.resolve();
    handlers.notificationclick!({ notification: { close: vi.fn(), data: url === undefined ? {} : { url } }, waitUntil: (p: Promise<unknown>) => (done = p) });
    return done;
  };
  return { click, clients };
}

describe('notification tap (service worker)', () => {
  it('focuses an open window on Safari versions without WindowClient.navigate', async () => {
    const win = { focus: vi.fn(async () => win) };
    const { click, clients } = loadWorker([win]);
    await expect(click('/#/oggi')).resolves.toBe(win);
    expect(win.focus).toHaveBeenCalledOnce();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it('still focuses when navigate() rejects (window not controlled by this worker)', async () => {
    const win = { focus: vi.fn(async () => win), navigate: vi.fn(() => Promise.reject(new TypeError('not controlled'))) };
    const { click } = loadWorker([win]);
    await expect(click('/#/fiori')).resolves.toBe(win);
    expect(win.navigate).toHaveBeenCalledWith('/#/fiori');
  });

  it('opens the app when it is closed (cold start from the notification)', async () => {
    const { click, clients } = loadWorker([]);
    await click('/#/oggi');
    expect(clients.openWindow).toHaveBeenCalledWith('/#/oggi');
  });

  it('never leaves the app, whatever the payload says', async () => {
    const { click, clients } = loadWorker([]);
    await click('https://evil.example/phish');
    expect(clients.openWindow).toHaveBeenCalledWith('/');
  });

  it('falls back to the home page without a url', async () => {
    const { click, clients } = loadWorker([]);
    await click();
    expect(clients.openWindow).toHaveBeenCalledWith('/');
  });
});

describe('service worker install (first launch offline)', () => {
  it('precaches the shell page and the build assets it loads', async () => {
    const handlers: Record<string, Handler> = {};
    const added: string[] = [];
    const html = '<script type="module" crossorigin src="/assets/index-AbC.js"></script><link rel="stylesheet" href="/assets/index-XyZ.css"><link rel="modulepreload" href="/assets/index-AbC.js">';
    const cache = {
      addAll: vi.fn(async (urls: string[]) => void added.push(...urls)),
      match: vi.fn(async (url: string) => (url === '/' ? { text: async () => html } : undefined)),
    };
    const self = { addEventListener: (type: string, fn: Handler) => (handlers[type] = fn), location: { origin: 'https://daily.example' }, clients: {}, skipWaiting: vi.fn() };
    runInNewContext(readFileSync('web/public/sw.js', 'utf8'), { self, caches: { open: async () => cache }, fetch: () => {}, URL });
    let done: Promise<unknown> = Promise.resolve();
    handlers.install!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect(added).toEqual(['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/apple-touch-icon.png', '/assets/index-AbC.js', '/assets/index-XyZ.css']);
    expect(self.skipWaiting).toHaveBeenCalled();
  });

  it('still installs when the shell page is missing from the cache', async () => {
    const handlers: Record<string, Handler> = {};
    const cache = { addAll: vi.fn(async () => {}), match: vi.fn(async () => undefined) };
    const self = { addEventListener: (type: string, fn: Handler) => (handlers[type] = fn), location: { origin: 'https://daily.example' }, clients: {}, skipWaiting: () => {} };
    runInNewContext(readFileSync('web/public/sw.js', 'utf8'), { self, caches: { open: async () => cache }, fetch: () => {}, URL });
    let done: Promise<unknown> = Promise.resolve();
    handlers.install!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await expect(done).resolves.toBeUndefined();
    expect(cache.addAll).toHaveBeenLastCalledWith([]);
  });
});
