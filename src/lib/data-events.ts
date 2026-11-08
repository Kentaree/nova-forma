/** Lets screens know data changed underneath them (e.g. a sync pulled new workouts). */
const listeners = new Set<() => void>();

export function onDataChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitDataChanged(): void {
  for (const fn of listeners) fn();
}
