export const LANGS = ['it', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export type LangSetting = Lang | 'auto';

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** Italian for an Italian device, English for everything else. */
export function langFromLocale(locale: string | undefined | null): Lang {
  return typeof locale === 'string' && /^it\b/i.test(locale) ? 'it' : 'en';
}

export function resolveLang(setting: LangSetting, locale: string | undefined | null): Lang {
  return setting === 'auto' ? langFromLocale(locale) : setting;
}

const it = {
  'nav.today': 'Oggi',
  'nav.prefs': 'Preferenze',
  'nav.flowers': 'Fiori',
  'greeting.mattina': 'Buongiorno',
  'greeting.pomeriggio': 'Buon pomeriggio',
  'greeting.sera': 'Buonasera',
  'greeting.notte': 'Dolce notte',
  'card.for': 'Per te',
  'card.yesterday': 'Il regalo di ieri',
  'card.sign': '— con affetto',
  'share.aria': 'Condividi il messaggio',
  'stage.fallback': 'Il tuo dispositivo non mostra il 3D, ma il bouquet di oggi c’è lo stesso.',
  'stage.aria': 'Bouquet 3D di {d}',
  'bouquet.today': 'Il bouquet di oggi: {d}.',
  'card.meaning': 'Cosa significa?',
  'meanings.title': 'Il linguaggio dei fiori',
  'meanings.today': 'Il tuo bouquet di oggi dice…',
  'meanings.all': 'Tutti i fiori',
  'meanings.natural': 'Ha sempre il suo colore naturale.',
  'meanings.note': 'Significati tratti dalla tradizione del linguaggio dei fiori; dove le fonti non sono d’accordo abbiamo scelto il più gentile.',
  'list.and': 'e',
  'next.today': 'Il nuovo bouquet arriva oggi alle {t}',
  'next.tomorrow': 'Prossimo bouquet domani alle {t}',
  'next.ask': 'Vuoi riceverlo ogni giorno? ',
  'next.enable': 'Attiva la notifica',
  'prefs.title': 'Come ti piace il bouquet?',
  'prefs.time': 'Arriva ogni giorno alle',
  'prefs.hours': 'Ore',
  'prefs.minutes': 'Minuti',
  'prefs.minus': '15 minuti prima',
  'prefs.plus': '15 minuti dopo',
  'prefs.notify': 'Notifica giornaliera',
  'prefs.privacy': 'Per la notifica salviamo solo l’indirizzo push anonimo di questo browser, l’orario, il fuso orario e la lingua. Spegnendola vengono cancellati. Fiori e colori restano sul tuo dispositivo.',
  'prefs.flowers': 'Fiori preferiti',
  'prefs.colors': 'Colori',
  'prefs.background': 'Sfondo',
  'prefs.language': 'Lingua',
  'theme.auto': 'Segue l’ora',
  'theme.chiaro': 'Chiaro',
  'theme.scuro': 'Scuro',
  'lang.auto': 'Automatica',
  'prefs.save': 'Salva orario e notifica',
  'prefs.style': 'Stile dei fiori',
  'style.realistico': 'Realistico',
  'style.3d': '3D interattivo',
  'prefs.styleHint': 'Realistico: fiori fotografici, più leggero; per ora rose e tulipani, gli altri fiori restano in 3D. 3D: puoi ruotare il bouquet col dito.',
  'prefs.realistic': 'Colori realistici',
  'prefs.realisticHint': 'Ogni fiore usa solo i colori che ha in natura: niente girasoli bianchi o rose azzurre.',
  'prefs.preview': 'Anteprima di oggi: {d}.',
  'status.autosaved': 'Salvato ✓',
  'status.keepFlower': 'Tieni almeno un fiore.',
  'status.keepColor': 'Tieni almeno un colore.',
  'status.badTime': 'Scegli un orario valido.',
  'status.working': 'Un attimo…',
  'status.saved': 'Preferenze salvate. Il prossimo bouquet terrà conto dei tuoi gusti.',
  'status.notStored': 'Preferenze applicate, ma questo browser non può salvarle.',
  'hint.ios': 'Su iPhone: tocca Condividi › Aggiungi alla schermata Home, poi apri Daily Smile da lì per attivare le notifiche.',
  'hint.unsupported': 'Questo browser non supporta le notifiche push.',
  'push.blocked': 'Le notifiche sono bloccate: puoi abilitarle dalle impostazioni del browser.',
  'push.unreachable': 'Il server delle notifiche non è raggiungibile. Riprova più tardi.',
  'push.serverError': 'Il server delle notifiche ha risposto con un errore. Riprova più tardi.',
  'push.badKey': 'Il server delle notifiche non ha risposto correttamente. Riprova più tardi.',
  'push.device': 'Non è stato possibile attivare le notifiche su questo dispositivo.',
  'notif.title': 'Il tuo bouquet di oggi è arrivato',
  'share.suffix': '— Daily Smile',
  'brand.aria': 'Daily Smile',
} as const;

export type MessageKey = keyof typeof it;

const en: Record<MessageKey, string> = {
  'nav.today': 'Today',
  'nav.prefs': 'Preferences',
  'nav.flowers': 'Flowers',
  'greeting.mattina': 'Good morning',
  'greeting.pomeriggio': 'Good afternoon',
  'greeting.sera': 'Good evening',
  'greeting.notte': 'Sweet dreams',
  'card.for': 'For you',
  'card.yesterday': 'Yesterday’s gift',
  'card.sign': '— with love',
  'share.aria': 'Share the message',
  'stage.fallback': 'Your device can’t show 3D, but today’s bouquet is still here for you.',
  'stage.aria': '3D bouquet of {d}',
  'bouquet.today': 'Today’s bouquet: {d}.',
  'card.meaning': 'What does it mean?',
  'meanings.title': 'The language of flowers',
  'meanings.today': 'Today’s bouquet says…',
  'meanings.all': 'All the flowers',
  'meanings.natural': 'It always wears its natural colour.',
  'meanings.note': 'Meanings from the traditional language of flowers; where sources disagree, we chose the kindest one.',
  'list.and': 'and',
  'next.today': 'Your new bouquet arrives today at {t}',
  'next.tomorrow': 'Next bouquet tomorrow at {t}',
  'next.ask': 'Want it every day? ',
  'next.enable': 'Turn on the notification',
  'prefs.title': 'How do you like your bouquet?',
  'prefs.time': 'Arrives every day at',
  'prefs.hours': 'Hours',
  'prefs.minutes': 'Minutes',
  'prefs.minus': '15 minutes earlier',
  'prefs.plus': '15 minutes later',
  'prefs.notify': 'Daily notification',
  'prefs.privacy': 'For the notification we only store this browser’s anonymous push address, the time, the time zone and the language. Turning it off deletes them. Flowers and colours stay on your device.',
  'prefs.flowers': 'Favourite flowers',
  'prefs.colors': 'Colours',
  'prefs.background': 'Background',
  'prefs.language': 'Language',
  'theme.auto': 'Follows the time',
  'theme.chiaro': 'Light',
  'theme.scuro': 'Dark',
  'lang.auto': 'Automatic',
  'prefs.save': 'Save time and notification',
  'prefs.style': 'Flower style',
  'style.realistico': 'Realistic',
  'style.3d': 'Interactive 3D',
  'prefs.styleHint': 'Realistic: photographic flowers, lighter; roses and tulips for now, other flowers stay 3D. 3D: you can turn the bouquet with your finger.',
  'prefs.realistic': 'Realistic colours',
  'prefs.realisticHint': 'Each flower only in colours it has in nature: no white sunflowers or blue roses.',
  'prefs.preview': 'Today’s preview: {d}.',
  'status.autosaved': 'Saved ✓',
  'status.keepFlower': 'Keep at least one flower.',
  'status.keepColor': 'Keep at least one colour.',
  'status.badTime': 'Pick a valid time.',
  'status.working': 'One moment…',
  'status.saved': 'Preferences saved. Your next bouquet will follow your taste.',
  'status.notStored': 'Preferences applied, but this browser can’t save them.',
  'hint.ios': 'On iPhone: tap Share › Add to Home Screen, then open Daily Smile from there to turn on notifications.',
  'hint.unsupported': 'This browser doesn’t support push notifications.',
  'push.blocked': 'Notifications are blocked: you can allow them in the browser settings.',
  'push.unreachable': 'The notification server can’t be reached. Please try again later.',
  'push.serverError': 'The notification server returned an error. Please try again later.',
  'push.badKey': 'The notification server didn’t answer correctly. Please try again later.',
  'push.device': 'Notifications couldn’t be turned on on this device.',
  'notif.title': 'Your bouquet for today has arrived',
  'share.suffix': '— Daily Smile',
  'brand.aria': 'Daily Smile',
};

export const STRINGS: Record<Lang, Record<MessageKey, string>> = { it, en };

/** Translated string; `{name}` placeholders are filled from `vars`. */
export function t(lang: Lang, key: MessageKey, vars: Record<string, string> = {}): string {
  return STRINGS[lang][key].replace(/\{(\w+)\}/g, (m, name: string) => vars[name] ?? m);
}

/** "a, b and c" / "a, b e c". */
export function joinList(lang: Lang, parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} ${t(lang, 'list.and')} ${parts[parts.length - 1]}`;
}
