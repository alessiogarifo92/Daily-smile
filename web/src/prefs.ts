import {
  DEFAULT_COLORS,
  DEFAULT_FLOWERS,
  isFlowerColor,
  isFlowerType,
  type FlowerColor,
  type FlowerType,
} from '../../shared/flowers';
import { formatTime, parseTime } from '../../shared/schedule';
import type { LangSetting } from '../../shared/i18n';
import type { ThemeMode } from '../../shared/theme';

export interface Preferences {
  flowers: FlowerType[];
  colors: FlowerColor[];
  /** "HH:MM" local time of the daily notification. */
  time: string;
  notifications: boolean;
  theme: ThemeMode;
  /** 'auto' follows the device language. */
  lang: LangSetting;
  /** Each flower only in colours it has in nature. */
  realistic: boolean;
}

export const STORAGE_KEY = 'daily-smile:prefs:v1';

export function defaultPreferences(): Preferences {
  return {
    flowers: [...DEFAULT_FLOWERS],
    colors: [...DEFAULT_COLORS],
    time: '08:00',
    notifications: false,
    theme: 'auto',
    lang: 'auto',
    realistic: true,
  };
}

const THEMES: readonly ThemeMode[] = ['auto', 'chiaro', 'scuro'];
const LANG_SETTINGS: readonly LangSetting[] = ['auto', 'it', 'en'];

/** Validates untrusted (stored) data field by field; anything invalid falls back to its default. */
export function sanitizePreferences(raw: unknown): Preferences {
  const d = defaultPreferences();
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;
  const flowers = Array.isArray(r.flowers) ? [...new Set(r.flowers.filter(isFlowerType))] : d.flowers;
  const colors = Array.isArray(r.colors) ? [...new Set(r.colors.filter(isFlowerColor))] : d.colors;
  const time = parseTime(r.time);
  return {
    flowers: flowers.length > 0 ? flowers : d.flowers,
    colors: colors.length > 0 ? colors : d.colors,
    time: time ? formatTime(time) : d.time,
    notifications: typeof r.notifications === 'boolean' ? r.notifications : d.notifications,
    theme: THEMES.includes(r.theme as ThemeMode) ? (r.theme as ThemeMode) : d.theme,
    lang: LANG_SETTINGS.includes(r.lang as LangSetting) ? (r.lang as LangSetting) : d.lang,
    realistic: typeof r.realistic === 'boolean' ? r.realistic : d.realistic,
  };
}

type KV = Pick<Storage, 'getItem' | 'setItem'>;

export function loadPreferences(storage: KV | undefined): Preferences {
  if (!storage) return defaultPreferences();
  try {
    const text = storage.getItem(STORAGE_KEY);
    return text ? sanitizePreferences(JSON.parse(text)) : defaultPreferences();
  } catch {
    return defaultPreferences();
  }
}

/** Returns false when storage is unavailable (private mode, quota): the app keeps working in memory. */
export function savePreferences(storage: KV | undefined, prefs: Preferences): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sanitizePreferences(prefs)));
    return true;
  } catch {
    return false;
  }
}
