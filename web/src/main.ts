import './styles.css';
import { dateKey, formatDate, localParts } from '../../shared/dates';
import { FLOWER_COLORS, FLOWER_TYPES, colorHex, colorLabel, composeBouquet, describeBouquet, flowerLabel, type Bouquet, type FlowerColor, type FlowerType } from '../../shared/flowers';
import { resolveLang, t, type Lang, type LangSetting, type MessageKey } from '../../shared/i18n';
import { colorMeaning, flowerMeaning, meaningColors, todayMeanings } from '../../shared/meanings';
import { messageFor } from '../../shared/messages';
import { formatTime, giftDayKey, parseTime } from '../../shared/schedule';
import { greetingForHour, isDark, resolvePhase, type ThemeMode } from '../../shared/theme';
import { createBouquet2DView } from './bouquet2d';
import { canDrawSprites } from './sprites';
import type { BouquetView } from './view';
import { flowerIcon } from './flowerIcons';
import { loadPreferences, savePreferences, type FlowerStyle, type Preferences } from './prefs';
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
type Renderer = '2d' | '3d';
let view: { kind: Renderer; view: BouquetView } | null = null;
let viewRequest = 0;
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
  renderMeanings();
  pushHint();
}

function applyTheme(mode: ThemeMode): void {
  const hour = localParts(Date.now(), timeZone).hour;
  const phase = resolvePhase(mode, hour);
  document.documentElement.dataset.phase = phase;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark(phase) ? (phase === 'sera' ? '#3B2F5C' : '#1F2340') : '#F7EEE4');
  $('greeting').textContent = greetingForHour(hour, lang);
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
  renderMeanings();
  void showBouquet(bouquet);
}

/**
 * Realistic style draws pre-rendered sprites in 2D; a bouquet with a flower that has no sprite
 * yet, or the 3D style, uses the 3D view, whose code (three.js) is only downloaded then.
 */
async function showBouquet(bouquet: Bouquet): Promise<void> {
  const want: Renderer = prefs.style === 'realistico' && canDrawSprites(bouquet) ? '2d' : '3d';
  if (view?.kind === want) return view.view.show(bouquet);
  const request = ++viewRequest;
  const stage = $('stage');
  let kind = want;
  let next = want === '2d' ? await createBouquet2DView(stage, bouquet) : null;
  if (!next && request === viewRequest) {
    kind = '3d';
    const { createBouquetView } = await import('./bouquet3d');
    if (request === viewRequest) {
      next = createBouquetView(stage);
      next?.show(bouquet);
    }
  }
  if (request !== viewRequest) return next?.dispose();
  view?.view.dispose();
  view = next ? { kind, view: next } : null;
  stage.dataset.renderer = next ? kind : 'none';
  $('stage-fallback').hidden = next !== null;
  next?.setActive(currentTab() === 'oggi');
}

type Tab = 'oggi' | 'fiori' | 'preferenze';

function currentTab(): Tab {
  if (location.hash === '#/preferenze') return 'preferenze';
  return location.hash === '#/fiori' ? 'fiori' : 'oggi';
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
  const tab = currentTab();
  $('view-oggi').hidden = tab !== 'oggi';
  $('view-preferenze').hidden = tab !== 'preferenze';
  $('view-fiori').hidden = tab !== 'fiori';
  document.querySelectorAll<HTMLAnchorElement>('.tabs a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (tab === 'oggi' && todayStale) {
    todayStale = false;
    renderToday(true);
  }
  view?.view.setActive(tab === 'oggi');
  if (tab === 'preferenze') fillForm();
  if (tab === 'fiori') renderMeanings();
  window.scrollTo(0, 0);
}

// ---- Language of flowers ----

/** Icon, name and meaning of a flower, then one line per colour: a dot and what it says. */
function meaningBody(type: FlowerType, colors: readonly FlowerColor[]): HTMLElement[] {
  const text = document.createElement('p');
  text.className = 'meaning-text';
  text.textContent = flowerMeaning(type, lang);
  const out: HTMLElement[] = [text];
  if (type === 'lavanda') {
    const natural = document.createElement('p');
    natural.className = 'meaning-natural';
    natural.textContent = t(lang, 'meanings.natural');
    out.push(natural);
  }
  if (colors.length > 0) {
    const list = document.createElement('ul');
    list.className = 'color-meanings';
    for (const color of colors) {
      const li = document.createElement('li');
      li.dataset.color = color;
      const dot = document.createElement('span');
      dot.className = 'color-dot';
      dot.style.background = colorHex(color);
      dot.setAttribute('aria-hidden', 'true');
      const line = document.createElement('span');
      line.textContent = colorMeaning(type, color, lang) ?? '';
      li.append(dot, line);
      list.append(li);
    }
    out.push(list);
  }
  return out;
}

function meaningHead(type: FlowerType, tag: 'h3' | 'span'): HTMLElement[] {
  const icon = document.createElement('span');
  icon.className = 'meaning-icon';
  icon.innerHTML = flowerIcon(type);
  const name = document.createElement(tag);
  name.className = 'meaning-name';
  name.textContent = flowerLabel(type, lang);
  return [icon, name];
}

/** Today's flowers and colours first, then every flower with every colour it comes in. */
function renderMeanings(): void {
  const today = $('meanings-today');
  today.replaceChildren(
    ...todayMeanings(composeBouquet(prefs, todayKey())).map(({ type, colors }) => {
      const li = document.createElement('li');
      li.className = 'meaning-item';
      li.dataset.flower = type;
      const head = document.createElement('div');
      head.className = 'meaning-head';
      head.append(...meaningHead(type, 'h3'));
      li.append(head, ...meaningBody(type, colors));
      return li;
    }),
  );
  const all = $('meanings-all');
  const open = new Set([...all.querySelectorAll<HTMLDetailsElement>('details[open]')].map((d) => d.dataset.flower));
  all.replaceChildren(
    ...FLOWER_TYPES.map((f) => {
      const details = document.createElement('details');
      details.className = 'meaning-flower';
      details.dataset.flower = f.id;
      details.open = open.has(f.id);
      const summary = document.createElement('summary');
      summary.append(...meaningHead(f.id, 'span'));
      details.append(summary, ...meaningBody(f.id, meaningColors(f.id)));
      return details;
    }),
  );
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
  document.querySelectorAll<HTMLInputElement>('input[name="theme"], input[name="lang"], input[name="style"]').forEach((i) => i.addEventListener('change', commitPicks));

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
  const style = (document.querySelector<HTMLInputElement>('input[name="style"]:checked')?.value ?? prefs.style) as FlowerStyle;
  prefs = { ...prefs, flowers: [...draft.flowers], colors: [...draft.colors], realistic: $<HTMLInputElement>('realistic').checked, theme, lang: langSetting, style };
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
  document.querySelectorAll<HTMLInputElement>('input[name="style"]').forEach((i) => (i.checked = i.value === prefs.style));
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
