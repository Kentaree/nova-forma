import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

/**
 * Runs an async loader whenever the screen gains focus or the loader changes, so lists
 * stay fresh after navigating back from an edit screen. Stale responses are dropped.
 *
 * The React Compiler memoizes inline loaders on the values they capture, so
 * `useQuery(() => listExercises(db, { search }))` re-runs only when `db` or `search` change.
 */
export function useQuery<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const call = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const id = ++call.current;
      load().then(
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
    }, [load]),
  );

  return { data, error };
}
