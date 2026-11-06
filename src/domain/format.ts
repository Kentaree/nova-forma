import type { LogType, SetValues, WeightUnit } from './types';
import { fromKg } from './units';

export function trimNumber(n: number, decimals = 2): string {
  const f = 10 ** decimals;
  return String(Math.round(n * f) / f);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Compact one-line description of a set, e.g. "80×8", "12 reps", "0:45", "5 km · 25:10". */
export function formatSet(logType: LogType, s: SetValues, unit: WeightUnit): string {
  switch (logType) {
    case 'weight_reps':
      return `${s.weightKg != null ? trimNumber(fromKg(s.weightKg, unit), 1) : '–'}×${s.reps ?? '–'}`;
    case 'reps':
      return s.weightKg ? `+${trimNumber(fromKg(s.weightKg, unit), 1)}×${s.reps ?? '–'}` : `${s.reps ?? '–'} reps`;
    case 'time':
      return formatDuration(s.durationS ?? 0);
    case 'cardio': {
      const parts = [];
      if (s.distanceM) parts.push(`${trimNumber(s.distanceM / 1000, 2)} km`);
      if (s.durationS) parts.push(formatDuration(s.durationS));
      return parts.join(' · ') || '–';
    }
  }
}

/** Parses "1:30", "90", "1:02:05" into seconds. Returns null for anything else. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  return t.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}
