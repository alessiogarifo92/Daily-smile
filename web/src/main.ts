import './styles.css';
import { dateKey, formatDate, localParts } from '../../shared/dates';
import { FLOWER_COLORS, FLOWER_TYPES, colorLabel, composeBouquet, describeBouquet, flowerLabel, type FlowerColor, type FlowerType } from '../../shared/flowers';
import { resolveLang, t, type Lang, type LangSetting, type MessageKey } from '../../shared/i18n';
import { messageFor } from '../../shared/messages';
import { formatTime, giftDayKey, parseTime } from '../../shared/schedule';
import { greetingFor, isDark, resolvePhase, type ThemeMode } from '../../shared/theme';
import { createBouquetView, type BouquetView } from './bouquet3d';
import { flowerIcon } from './flowerIcons';
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
/** Preferences changed while the Today tab was hidden: redraw it when it comes back. */
let todayStale = false;

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
    const label = input.parentElement?.querySelector('.flower-name');
    if (label) label.textContent = flowerLabel(input.getAttribute('value') as FlowerType, lang);
  });
  document.querySelectorAll<HTMLElement>('.swatch').forEach((b) => {
    const name = colorLabel(b.dataset.color as FlowerColor, lang);
    b.setAttribute('aria-label', name);
    const caption = b.parentElement?.querySelector('.swatch-name');
    if (caption) caption.textContent = name;
  });
  renderPreview();
  pushHint();
}

function applyTheme(mode: ThemeMode): void {
  const phase = resolvePhase(mode, localParts(Date.now(), timeZone).hour);
  document.documentElement.dataset.phase = phase;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark(phase) ? (phase === 'sera' ? '#3B2F5C' : '#1F2340') : '#F7EEE4');
  $('greeting').textContent = greetingFor(phase, lang);
}

function renderToday(force = false): void {
  // The header always shows the real date; the card shows whose gift is on display.
  const realToday = dateKey(Date.now(), timeZone);
  $('today').textContent = formatDate(realToday, lang);
  renderNext();
  const key = todayKey();
  if (!force && key === shownKey) return;
  shownKey = key;
  const bouquet = composeBouquet(prefs, key);
  const description = describeBouquet(bouquet, lang);
  $('card-for').textContent = t(lang, key === realToday ? 'card.for' : 'card.yesterday');
  $('card-date').textContent = formatDate(key, lang);
  $('message').textContent = messageFor(key, lang);
  $('bouquet-desc').textContent = t(lang, 'bouquet.today', { d: description });
  $('stage').setAttribute('aria-label', t(lang, 'stage.aria', { d: description }));
  if (view === undefined) view = createBouquetView($('stage'));
  if (view) view.show(bouquet);
  else $('stage-fallback').hidden = false;
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
  if (tab === 'oggi' && todayStale) {
    todayStale = false;
    renderToday(true);
  }
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
    // A card: a transparent checkbox covers it, so it stays a real, labelled form control.
    const label = document.createElement('label');
    label.className = 'flower-card';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'flower';
    input.value = f.id;
    input.className = 'card-input';
    input.addEventListener('change', () => toggle(draft.flowers, f.id, input, 'status.keepFlower'));
    const icon = document.createElement('span');
    icon.className = 'flower-icon';
    icon.innerHTML = flowerIcon(f.id);
    const text = document.createElement('span');
    text.className = 'flower-name';
    label.append(input, icon, text);
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
      if (draft.colors.has(c.id) && draft.colors.size === 1) return pickStatus('status.keepColor');
      if (draft.colors.has(c.id)) draft.colors.delete(c.id);
      else draft.colors.add(c.id);
      b.setAttribute('aria-pressed', String(draft.colors.has(c.id)));
      commitPicks();
    });
    const item = document.createElement('div');
    item.className = 'swatch-item';
    const caption = document.createElement('span');
    caption.className = 'swatch-name';
    caption.setAttribute('aria-hidden', 'true'); // the button's own label already says it
    item.append(b, caption);
    colorList.append(item);
  }
  $('realistic').addEventListener('change', commitPicks);
  document.querySelectorAll<HTMLInputElement>('input[name="theme"], input[name="lang"]').forEach((i) => i.addEventListener('change', commitPicks));

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
    pickStatus(lastMsg);
    return;
  }
  if (input.checked) set.add(id);
  else set.delete(id);
  commitPicks();
}

/**
 * Flowers, colours, realism, background and language apply and save as soon as they change;
 * only the time and the notification wait for the button, because they reach the push server.
 */
function commitPicks(): void {
  const theme = (document.querySelector<HTMLInputElement>('input[name="theme"]:checked')?.value ?? prefs.theme) as ThemeMode;
  const langSetting = (document.querySelector<HTMLInputElement>('input[name="lang"]:checked')?.value ?? prefs.lang) as LangSetting;
  prefs = { ...prefs, flowers: [...draft.flowers], colors: [...draft.colors], realistic: $<HTMLInputElement>('realistic').checked, theme, lang: langSetting };
  const saved = savePreferences(storage, prefs);
  const nextLang = resolveLang(langSetting, navigator.language);
  if (nextLang !== lang) {
    lang = nextLang;
    applyLanguage();
  }
  applyTheme(prefs.theme);
  todayStale = true;
  renderPreview();
  pickStatus(saved ? 'status.autosaved' : 'status.notStored');
}

/** What today's bouquet looks like with the current choices. */
function renderPreview(): void {
  const description = describeBouquet(composeBouquet(prefs, todayKey()), lang);
  $('prefs-preview').textContent = t(lang, 'prefs.preview', { d: description });
}

function pickStatus(key: MessageKey | null): void {
  $('pick-status').textContent = key ? t(lang, key) : '';
}

function fillForm(): void {
  draft.flowers = new Set(prefs.flowers);
  draft.colors = new Set(prefs.colors);
  document.querySelectorAll<HTMLInputElement>('input[name="flower"]').forEach((i) => (i.checked = draft.flowers.has(i.value as FlowerType)));
  document.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(draft.colors.has(b.dataset.color as FlowerColor))));
  setTimeBoxes(prefs.time);
  $<HTMLInputElement>('notifications').checked = prefs.notifications;
  $<HTMLInputElement>('realistic').checked = prefs.realistic;
  document.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach((i) => (i.checked = i.value === prefs.theme));
  document.querySelectorAll<HTMLInputElement>('input[name="lang"]').forEach((i) => (i.checked = i.value === prefs.lang));
  status(null);
  pickStatus(null);
  renderPreview();
}

function status(key: MessageKey | null): void {
  $('prefs-status').textContent = key ? t(lang, key) : '';
}

async function submit(): Promise<void> {
  const time = partsToTime(hoursBox().value, minutesBox().value);
  if (!time) return status('status.badTime');
  const wantsPush = $<HTMLInputElement>('notifications').checked;
  const next: Preferences = { ...prefs, time: formatTime(time), notifications: wantsPush };
  const save = document.querySelector<HTMLButtonElement>('#prefs button[type="submit"]');
  if (save) save.disabled = true;
  status('status.working');

  let pushError: MessageKey | null = null;
  try {
    if (wantsPush) await enablePush(next.time, timeZone, lang);
    else if (prefs.notifications) await disablePush();
  } catch (err) {
    pushError = err instanceof PushError ? err.key : 'push.device';
    // A failed enable leaves them off; a failed disable leaves them on.
    next.notifications = !wantsPush && prefs.notifications;
  }

  if (save) save.disabled = false;
  prefs = next;
  const saved = savePreferences(storage, prefs);
  setTimeBoxes(prefs.time);
  applyTheme(prefs.theme);
  renderToday(true);
  renderPreview();
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
