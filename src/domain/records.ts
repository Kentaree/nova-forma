import type { LoggedSet, LogType } from './types';
import { estimateOneRepMax } from './units';

/**
 * The single number used to rank sets of an exercise, for personal records:
 * - weight × reps: estimated 1RM (falls back to the weight for very high-rep sets);
 * - reps: reps, with added weight as a tie-break;
 * - time: seconds held;
 * - cardio: distance, or duration when no distance was logged.
 * Warm-ups never count.
 */
export function prScore(logType: LogType, s: LoggedSet): number | null {
  if (s.setType === 'warmup') return null;
  switch (logType) {
    case 'weight_reps':
      return estimateOneRepMax(s.weightKg, s.reps) ?? (s.reps ? s.weightKg : null);
    case 'reps':
      return s.reps ? s.reps + (s.weightKg ?? 0) / 1000 : null;
    case 'time':
      return s.durationS || null;
    case 'cardio':
      return s.distanceM || s.durationS || null;
  }
}

export function bestSet(logType: LogType, sets: LoggedSet[]): LoggedSet | null {
  let best: LoggedSet | null = null;
  let bestScore = -Infinity;
  for (const s of sets) {
    const score = prScore(logType, s);
    if (score != null && score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Ids of today's sets that beat the best from earlier sessions. Only the first set to
 * reach each new high is flagged, so repeating the same weight twice is one PR.
 * Nothing is flagged the first time an exercise is logged: there's nothing to beat.
 */
export function prSetIds(logType: LogType, today: LoggedSet[], previousBest: number | null): Set<string> {
  const ids = new Set<string>();
  if (previousBest == null) return ids;
  let bar = previousBest;
  for (const s of today) {
    const score = prScore(logType, s);
    if (score != null && score > bar + 1e-9) {
      ids.add(s.id);
      bar = score;
    }
  }
  return ids;
}

/** Total weight moved (kg × reps) across working sets of weight exercises. */
export function volumeKg(sets: { setType: string; weightKg: number | null; reps: number | null }[]): number {
  return sets.reduce((v, s) => (s.setType === 'warmup' || !s.weightKg || !s.reps ? v : v + s.weightKg * s.reps), 0);
}
