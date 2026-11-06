export interface TargetLike {
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
}

/** "3 × 8–12", "5 × 5", "3 sets", or null when there's no target. */
export function formatTarget(t: TargetLike | null): string | null {
  if (!t) return null;
  const reps =
    t.repsMin != null && t.repsMax != null && t.repsMin !== t.repsMax
      ? `${t.repsMin}–${t.repsMax}`
      : (t.repsMin ?? t.repsMax ?? null);
  if (t.sets && reps != null) return `${t.sets} × ${reps}`;
  if (t.sets) return `${t.sets} sets`;
  if (reps != null) return `${reps} reps`;
  return null;
}
