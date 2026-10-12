import type { Lang, MessageKey } from '../../shared/i18n';

/** A failure the UI shows to the user, as a translation key. */
export class PushError extends Error {
  constructor(readonly key: MessageKey) {
    super(key);
  }
}

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

/**
 * iPhone and iPad (iOS 16.4+) only offer Web Push to the app added to the Home Screen; in a Safari tab
 * PushManager is missing, so we tell them to install instead of calling it unsupported.
 */
export function pushSupport(nav: Navigator & { standalone?: boolean } = navigator, win: Window = window): PushSupport {
  const isIos = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const standalone = win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
  if (isIos && !standalone) return 'needs-install';
  if (!('serviceWorker' in nav) || !('PushManager' in win) || !('Notification' in win)) return 'unsupported';
  return 'supported';
}

/** An uncompressed P-256 public key: 65 bytes, 87 base64url characters. */
export function isVapidKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{87}$/.test(value);
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  } catch {
    throw new PushError('push.unreachable');
  }
  if (!res.ok) throw new PushError('push.serverError');
  return res;
}

/** Rejects with a readable error instead of leaving the user waiting forever. */
export function withTimeout<T>(promise: Promise<T>, ms: number, key: MessageKey = 'push.device'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PushError(key)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Asks permission, subscribes this device and registers the daily time with the server. */
export async function enablePush(time: string, timeZone: string, lang: Lang): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushError('push.blocked');
  const reg = await withTimeout(navigator.serviceWorker.ready, 10_000);
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = (await (await api('/api/vapid-public-key')).text()).trim();
    if (!isVapidKey(key)) throw new PushError('push.badKey');
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) });
    } catch {
      throw new PushError('push.device');
    }
  }
  await api('/api/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON(), time, timeZone, lang }) });
}

export async function disablePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api('/api/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) });
  await sub.unsubscribe();
}
