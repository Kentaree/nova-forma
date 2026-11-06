/**
 * The rest timer is stored as an absolute end time rather than a ticking counter,
 * so it stays correct while the app is backgrounded or the phone is locked.
 */
export interface RestTimer {
  endsAt: number; // epoch ms
  durationS: number;
}

export function startRest(durationS: number, now: number): RestTimer {
  return { endsAt: now + durationS * 1000, durationS };
}

export function remainingSeconds(t: RestTimer, now: number): number {
  return Math.max(0, Math.ceil((t.endsAt - now) / 1000));
}

export function adjustRest(t: RestTimer, deltaS: number, now: number): RestTimer | null {
  const remaining = remainingSeconds(t, now) + deltaS;
  if (remaining <= 0) return null;
  return { endsAt: now + remaining * 1000, durationS: Math.max(t.durationS + deltaS, remaining) };
}

/**
 * In a superset, rest only after the last exercise of the group; between members you go
 * straight to the next exercise. `groupMembers` is the ordered ids in the superset.
 */
export function shouldRestAfter(sessionExerciseId: string, groupMembers: string[] | null): boolean {
  if (!groupMembers || groupMembers.length < 2) return true;
  return groupMembers.at(-1) === sessionExerciseId;
}
