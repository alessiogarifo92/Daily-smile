import { t, type Lang } from './i18n';

export type DayPhase = 'mattina' | 'pomeriggio' | 'sera' | 'notte';
export type ThemeMode = 'auto' | 'chiaro' | 'scuro';

/** Phase of the day for the hour of access (0-23). */
export function phaseForHour(hour: number): DayPhase {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RangeError(`Invalid hour: ${hour}`);
  if (hour >= 5 && hour < 12) return 'mattina';
  if (hour >= 12 && hour < 18) return 'pomeriggio';
  if (hour >= 18 && hour < 21) return 'sera';
  return 'notte';
}

/** Theme actually applied: the user's override wins, otherwise it follows the clock. */
export function resolvePhase(mode: ThemeMode, hour: number): DayPhase {
  if (mode === 'chiaro') return 'mattina';
  if (mode === 'scuro') return 'notte';
  return phaseForHour(hour);
}

export function isDark(phase: DayPhase): boolean {
  return phase === 'sera' || phase === 'notte';
}

export function greetingFor(phase: DayPhase, lang: Lang = 'it'): string {
  return t(lang, `greeting.${phase}`);
}

/** The greeting always follows the clock, whatever theme the user forced. */
export function greetingForHour(hour: number, lang: Lang = 'it'): string {
  return greetingFor(phaseForHour(hour), lang);
}
