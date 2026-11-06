import type { LoggedSet, LogType, SetValues } from './types';

const EMPTY: SetValues = { weightKg: null, reps: null, durationS: null, distanceM: null };

const DEFAULTS: Record<LogType, SetValues> = {
  weight_reps: { ...EMPTY, weightKg: 20, reps: 8 },
  reps: { ...EMPTY, reps: 10 },
  time: { ...EMPTY, durationS: 30 },
  cardio: { ...EMPTY, durationS: 600 },
};

function values(s: SetValues): SetValues {
  return { weightKg: s.weightKg, reps: s.reps, durationS: s.durationS, distanceM: s.distanceM };
}

/**
 * What to pre-fill for the next set, so logging is usually a single tap:
 * 1. the matching set from last time (set 3 today ← set 3 last time), skipping warm-ups
 *    so the working-set pattern carries over;
 * 2. otherwise the set just logged today (keeps going at the same weight);
 * 3. otherwise a sensible default for the exercise type.
 */
export function suggestNextSet(logType: LogType, today: LoggedSet[], lastTime: LoggedSet[]): SetValues {
  const workingToday = today.filter((s) => s.setType !== 'warmup');
  const workingLast = lastTime.filter((s) => s.setType !== 'warmup');
  const lastToday = today.at(-1);

  // Still warming up today: follow on from the warm-up just done.
  if (lastToday?.setType === 'warmup') return values(lastToday);

  const matching = workingLast[workingToday.length];
  if (matching) {
    // If today's sets have already gone heavier than last time's, keep today's weight.
    const prev = workingToday.at(-1);
    if (prev?.weightKg != null && matching.weightKg != null && prev.weightKg > matching.weightKg) {
      return { ...values(matching), weightKg: prev.weightKg };
    }
    return values(matching);
  }
  if (lastToday) return values(lastToday);
  if (workingLast.length) return values(workingLast.at(-1)!);
  return DEFAULTS[logType];
}
