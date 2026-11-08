import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { onDataChanged } from '@/lib/data-events';

/**
 * Runs an async loader when the screen gains focus, when `key` changes, or when
 * `reload()` is called or a sync pulls new data, so screens stay fresh after edits. Stale responses are dropped.
 *
 * `key` must describe every input the loader depends on (e.g. `${search}|${muscle}`).
 * The loader itself may be a new function on every render; only `key` triggers re-runs.
 */
export function useQuery<T>(load: () => Promise<T>, key = '') {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const call = useRef(0);
  const latest = useRef(load);
  useLayoutEffect(() => {
    latest.current = load;
  });

  const reload = useCallback(() => {
    const id = ++call.current;
    latest.current().then(
      (d) => {
        if (id === call.current) {
          setData(d);
          setError(null);
        }
      },
      (e: Error) => {
        if (id === call.current) setError(e);
      },
    );
  }, []);

  // Refresh when returning to the screen (e.g. after an edit elsewhere)...
  useFocusEffect(reload);
  // ...and whenever the inputs change.
  useEffect(reload, [key, reload]);
  // ...and when a sync brings in new data.
  useEffect(() => onDataChanged(reload), [reload]);

  return { data, error, reload };
}
