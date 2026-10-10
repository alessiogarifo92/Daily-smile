import './styles.css';
import { formatDate, localParts } from '../../shared/dates';
import { FLOWER_COLORS, FLOWER_TYPES, colorLabel, composeBouquet, describeBouquet, flowerLabel, type FlowerColor, type FlowerType } from '../../shared/flowers';
import { resolveLang, t, type Lang, type LangSetting, type MessageKey } from '../../shared/i18n';
import { messageFor } from '../../shared/messages';
import { formatTime, giftDayKey, parseTime } from '../../shared/schedule';
import { greetingFor, isDark, resolvePhase, type ThemeMode } from '../../shared/theme';
import { createBouquetView, type BouquetView } from './bouquet3d';
import { loadPreferences, savePreferences, type Preferences } from './prefs';
import { PushError, disablePush, enablePush, pushSupport } from './push';
import { cleanDigits, hourComplete, partsToTime, shiftTime, timeToParts } from './timeInput';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';

let prefs = loadPreferences(storage);
let lang: Lang = resolveLang(prefs.lang, navigator.language);
let view: BouquetView | null | undefined;
let shownKey = '';

/** The day whose gift is on display: it changes at the notification time when one is set. */
function todayKey(): string {
  return giftDayKey(Date.now(), timeZone, prefs.notifications ? parseTime(prefs.time) : null);
}

/** Static texts marked in the HTML with data-i18n / data-i18n-aria. */
function applyLanguage(): void {
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(lang, el.dataset.i18n as MessageKey)));
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(lang, el.dataset.i18nAria as MessageKey)));
  document.querySelectorAll<HTMLElement>('input[name="flower"]').forEach((input) => {
    const label = input.parentElement?.querySelector('span');
    if (label) label.textContent = flowerLabel(input.getAttribute('value') as FlowerType, lang);
  });
  document.querySelectorAll<HTMLElement>('.swatch').forEach((b) => b.setAttribute('aria-label', colorLabel(b.dataset.color as FlowerColor, lang)));
  pushHint();
}

function applyTheme(mode: ThemeMode): void {
  const phase = resolvePhase(mode, localParts(Date.now(), timeZone).hour);
  document.documentElement.dataset.phase = phase;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark(phase) ? (phase === 'sera' ? '#3B2F5C' : '#1F2340') : '#F7EEE4');
  $('greeting').textContent = greetingFor(phase, lang);
}

function renderToday(force = false): void {
  const key = todayKey();
  if (!force && key === shownKey) return;
  shownKey = key;
  const bouquet = composeBouquet(prefs, key);
  const description = describeBouquet(bouquet, lang);
  const pretty = formatDate(key, lang);
  $('today').textContent = pretty;
  $('card-date').textContent = pretty;
  $('message').textContent = messageFor(key, lang);
  $('bouquet-desc').textContent = t(lang, 'bouquet.today', { d: description });
  $('stage').setAttribute('aria-label', t(lang, 'stage.aria', { d: description }));
  if (view === undefined) view = createBouquetView($('stage'));
  if (view) view.show(bouquet);
  else $('stage-fallback').hidden = false;
  renderNext();
}

function renderNext(): void {
  const el = $('next');
  el.textContent = '';
  if (prefs.notifications) {
    const now = localParts(Date.now(), timeZone);
    const time = parseTime(prefs.time);
    const later = time !== null && now.hour * 60 + now.minute < time.hour * 60 + time.minute;
    el.textContent = t(lang, later ? 'next.today' : 'next.tomorrow', { t: prefs.time });
  } else {
    el.append(t(lang, 'next.ask'));
    const a = document.createElement('a');
    a.href = '#/preferenze';
    a.textContent = t(lang, 'next.enable');
    el.append(a);
  }
}

function route(): void {
  const tab = location.hash === '#/preferenze' ? 'preferenze' : 'oggi';
  $('view-oggi').hidden = tab !== 'oggi';
  $('view-preferenze').hidden = tab !== 'preferenze';
  document.querySelectorAll<HTMLAnchorElement>('.tabs a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  view?.setActive(tab === 'oggi');
  if (tab === 'preferenze') fillForm();
  window.scrollTo(0, 0);
}

// ---- Preferences form ----

const draft = { flowers: new Set<FlowerType>(), colors: new Set<FlowerColor>() };
const hoursBox = () => $<HTMLInputElement>('time-h');
const minutesBox = () => $<HTMLInputElement>('time-m');

function setTimeBoxes(value: string): void {
  const time = parseTime(value) ?? { hour: 8, minute: 0 };
  [hoursBox().value, minutesBox().value] = timeToParts(time);
}

function buildForm(): void {
  const flowerList = $('flower-list');
  for (const f of FLOWER_TYPES) {
    const label = document.createElement('label');
    const text = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'flower';
    input.value = f.id;
    input.addEventListener('change', () => toggle(draft.flowers, f.id, input, 'status.keepFlower'));
    label.append(text, input);
    flowerList.append(label);
  }
  const colorList = $('color-list');
  for (const c of FLOWER_COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.color = c.id;
    b.style.background = c.hex;
    b.addEventListener('click', () => {
      if (draft.colors.has(c.id) && draft.colors.size === 1) return status('status.keepColor');
      if (draft.colors.has(c.id)) draft.colors.delete(c.id);
      else draft.colors.add(c.id);
      b.setAttribute('aria-pressed', String(draft.colors.has(c.id)));
      status(null);
    });
    colorList.append(b);
  }

  // Time: two numeric boxes (numeric keypad on phones, always 24h).
  const h = hoursBox();
  const m = minutesBox();
  for (const box of [h, m]) {
    box.addEventListener('focus', () => box.select());
    box.addEventListener('input', () => (box.value = cleanDigits(box.value)));
  }
  h.addEventListener('input', () => {
    if (hourComplete(h.value)) m.focus();
  });
  const normalize = () => {
    const time = partsToTime(h.value, m.value);
    if (time) setTimeBoxes(formatTime(time));
  };
  h.addEventListener('blur', normalize);
  m.addEventListener('blur', normalize);
  const step = (delta: number) => {
    const time = partsToTime(h.value, m.value) ?? { hour: 8, minute: 0 };
    setTimeBoxes(formatTime(shiftTime(time, delta)));
  };
  $('time-minus').addEventListener('click', () => step(-15));
  $('time-plus').addEventListener('click', () => step(15));

  $<HTMLInputElement>('notifications').disabled = pushSupport() !== 'supported';

  $('prefs').addEventListener('submit', (e) => {
    e.preventDefault();
    void submit();
  });
}

function pushHint(): void {
  const support = pushSupport();
  const hint = $('push-hint');
  hint.hidden = support === 'supported';
  if (support === 'needs-install') hint.textContent = t(lang, 'hint.ios');
  else if (support === 'unsupported') hint.textContent = t(lang, 'hint.unsupported');
}

function toggle<T>(set: Set<T>, id: T, input: HTMLInputElement, lastMsg: MessageKey): void {
  if (!input.checked && set.size === 1 && set.has(id)) {
    input.checked = true;
    status(lastMsg);
    return;
  }
  if (input.checked) set.add(id);
  else set.delete(id);
  status(null);
}

function fillForm(): void {
  draft.flowers = new Set(prefs.flowers);
  draft.colors = new Set(prefs.colors);
  document.querySelectorAll<HTMLInputElement>('input[name="flower"]').forEach((i) => (i.checked = draft.flowers.has(i.value as FlowerType)));
  document.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(draft.colors.has(b.dataset.color as FlowerColor))));
  setTimeBoxes(prefs.time);
  $<HTMLInputElement>('notifications').checked = prefs.notifications;
  document.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach((i) => (i.checked = i.value === prefs.theme));
  document.querySelectorAll<HTMLInputElement>('input[name="lang"]').forEach((i) => (i.checked = i.value === prefs.lang));
  status(null);
}

function status(key: MessageKey | null): void {
  $('prefs-status').textContent = key ? t(lang, key) : '';
}

async function submit(): Promise<void> {
  const time = partsToTime(hoursBox().value, minutesBox().value);
  if (!time) return status('status.badTime');
  const theme = (document.querySelector<HTMLInputElement>('input[name="theme"]:checked')?.value ?? 'auto') as ThemeMode;
  const langSetting = (document.querySelector<HTMLInputElement>('input[name="lang"]:checked')?.value ?? 'auto') as LangSetting;
  const wantsPush = $<HTMLInputElement>('notifications').checked;
  const next: Preferences = { flowers: [...draft.flowers], colors: [...draft.colors], time: formatTime(time), notifications: wantsPush, theme, lang: langSetting };
  const nextLang = resolveLang(langSetting, navigator.language);
  const save = document.querySelector<HTMLButtonElement>('#prefs button[type="submit"]');
  if (save) save.disabled = true;
  status('status.working');

  let pushError: MessageKey | null = null;
  try {
    if (wantsPush) await enablePush(next.time, timeZone, nextLang);
    else if (prefs.notifications) await disablePush();
  } catch (err) {
    pushError = err instanceof PushError ? err.key : 'push.device';
    // A failed enable leaves them off; a failed disable leaves them on.
    next.notifications = !wantsPush && prefs.notifications;
  }

  if (save) save.disabled = false;
  prefs = next;
  lang = nextLang;
  const saved = savePreferences(storage, prefs);
  setTimeBoxes(prefs.time);
  applyLanguage();
  applyTheme(prefs.theme);
  renderToday(true);
  status(pushError ?? (saved ? 'status.saved' : 'status.notStored'));
}

// ---- Boot ----

buildForm();
applyLanguage();
applyTheme(prefs.theme);
renderToday(true);
route();
window.addEventListener('hashchange', route);
$('share').addEventListener('click', async () => {
  const text = `${$('message').textContent ?? ''} ${t(lang, 'share.suffix')}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Daily Smile', text });
    else await navigator.clipboard.writeText(text);
  } catch {
    /* sharing cancelled */
  }
});
// Keep the theme and the bouquet in step with the clock while the app stays open.
setInterval(() => {
  applyTheme(prefs.theme);
  renderToday();
}, 60_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    applyTheme(prefs.theme);
    renderToday();
  }
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register('/sw.js');
}
