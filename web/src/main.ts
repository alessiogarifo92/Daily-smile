import './styles.css';
import { dateKey, italianDate, localParts } from '../../shared/dates';
import { FLOWER_COLORS, FLOWER_TYPES, composeBouquet, type FlowerColor, type FlowerType } from '../../shared/flowers';
import { messageFor } from '../../shared/messages';
import { formatTime, parseTime } from '../../shared/schedule';
import { greetingFor, isDark, resolvePhase, type ThemeMode } from '../../shared/theme';
import { createBouquetView, type BouquetView } from './bouquet3d';
import { loadPreferences, savePreferences, type Preferences } from './prefs';
import { disablePush, enablePush, pushSupport } from './push';

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
let view: BouquetView | null | undefined;
let shownKey = '';

function todayKey(): string {
  return dateKey(Date.now(), timeZone);
}

function applyTheme(mode: ThemeMode): void {
  const phase = resolvePhase(mode, localParts(Date.now(), timeZone).hour);
  document.documentElement.dataset.phase = phase;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark(phase) ? (phase === 'sera' ? '#3B2F5C' : '#1F2340') : '#F7EEE4');
  $('greeting').textContent = greetingFor(phase);
}

function renderToday(force = false): void {
  const key = todayKey();
  if (!force && key === shownKey) return;
  shownKey = key;
  const bouquet = composeBouquet(prefs, key);
  const pretty = italianDate(key);
  $('today').textContent = pretty;
  $('card-date').textContent = pretty;
  $('message').textContent = messageFor(key);
  $('bouquet-desc').textContent = `Il bouquet di oggi: ${bouquet.description}.`;
  $('stage').setAttribute('aria-label', `Bouquet 3D di ${bouquet.description}`);
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
    const t = parseTime(prefs.time);
    const later = t !== null && now.hour * 60 + now.minute < t.hour * 60 + t.minute;
    el.textContent = `Prossimo bouquet ${later ? 'oggi' : 'domani'} alle ${prefs.time}`;
  } else {
    el.append('Vuoi riceverlo ogni giorno? ');
    const a = document.createElement('a');
    a.href = '#/preferenze';
    a.textContent = 'Attiva la notifica';
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
  if (tab === 'preferenze') fillForm();
  window.scrollTo(0, 0);
}

// ---- Preferences form ----

const draft = { flowers: new Set<FlowerType>(), colors: new Set<FlowerColor>() };

function buildForm(): void {
  const flowerList = $('flower-list');
  for (const f of FLOWER_TYPES) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'flower';
    input.value = f.id;
    input.addEventListener('change', () => toggle(draft.flowers, f.id, input, 'Tieni almeno un fiore.'));
    label.append(f.label, input);
    flowerList.append(label);
  }
  const colorList = $('color-list');
  for (const c of FLOWER_COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.color = c.id;
    b.style.background = c.hex;
    b.setAttribute('aria-label', c.label);
    b.addEventListener('click', () => {
      if (draft.colors.has(c.id) && draft.colors.size === 1) return status('Tieni almeno un colore.');
      if (draft.colors.has(c.id)) draft.colors.delete(c.id);
      else draft.colors.add(c.id);
      b.setAttribute('aria-pressed', String(draft.colors.has(c.id)));
      status('');
    });
    colorList.append(b);
  }
  const time = $<HTMLInputElement>('time');
  const step = (delta: number) => {
    const t = parseTime(time.value) ?? { hour: 8, minute: 0 };
    const m = (((t.hour * 60 + t.minute + delta) % 1440) + 1440) % 1440;
    time.value = formatTime({ hour: Math.floor(m / 60), minute: m % 60 });
  };
  $('time-minus').addEventListener('click', () => step(-15));
  $('time-plus').addEventListener('click', () => step(15));

  const support = pushSupport();
  const hint = $('push-hint');
  if (support === 'needs-install') {
    hint.hidden = false;
    hint.textContent = 'Su iPhone: tocca Condividi › Aggiungi alla schermata Home, poi apri Daily Smile da lì per attivare le notifiche.';
  } else if (support === 'unsupported') {
    hint.hidden = false;
    hint.textContent = 'Questo browser non supporta le notifiche push.';
  }
  $<HTMLInputElement>('notifications').disabled = support !== 'supported';

  $('prefs').addEventListener('submit', (e) => {
    e.preventDefault();
    void submit();
  });
}

function toggle<T>(set: Set<T>, id: T, input: HTMLInputElement, lastMsg: string): void {
  if (!input.checked && set.size === 1 && set.has(id)) {
    input.checked = true;
    status(lastMsg);
    return;
  }
  if (input.checked) set.add(id);
  else set.delete(id);
  status('');
}

function fillForm(): void {
  draft.flowers = new Set(prefs.flowers);
  draft.colors = new Set(prefs.colors);
  document.querySelectorAll<HTMLInputElement>('input[name="flower"]').forEach((i) => (i.checked = draft.flowers.has(i.value as FlowerType)));
  document.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(draft.colors.has(b.dataset.color as FlowerColor))));
  $<HTMLInputElement>('time').value = prefs.time;
  $<HTMLInputElement>('notifications').checked = prefs.notifications;
  document.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach((i) => (i.checked = i.value === prefs.theme));
  status('');
}

function status(text: string): void {
  $('prefs-status').textContent = text;
}

async function submit(): Promise<void> {
  const time = parseTime($<HTMLInputElement>('time').value);
  if (!time) return status('Scegli un orario valido.');
  const theme = (document.querySelector<HTMLInputElement>('input[name="theme"]:checked')?.value ?? 'auto') as ThemeMode;
  const wantsPush = $<HTMLInputElement>('notifications').checked;
  const next: Preferences = { flowers: [...draft.flowers], colors: [...draft.colors], time: formatTime(time), notifications: wantsPush, theme };

  let pushError = '';
  try {
    if (wantsPush) await enablePush(next.time, timeZone);
    else if (prefs.notifications) await disablePush();
  } catch (err) {
    pushError = err instanceof Error ? err.message : String(err);
    // A failed enable leaves them off; a failed disable leaves them on.
    next.notifications = !wantsPush && prefs.notifications;
  }

  prefs = next;
  const saved = savePreferences(storage, prefs);
  applyTheme(prefs.theme);
  renderToday(true);
  status(pushError || (saved ? 'Preferenze salvate. Il prossimo bouquet terrà conto dei tuoi gusti.' : 'Preferenze applicate, ma questo browser non può salvarle.'));
}

// ---- Boot ----

buildForm();
applyTheme(prefs.theme);
renderToday(true);
route();
window.addEventListener('hashchange', route);
$('share').addEventListener('click', async () => {
  const text = `${$('message').textContent ?? ''} — Daily Smile`;
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
