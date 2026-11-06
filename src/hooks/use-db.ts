import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';

import { fromExpo } from '@/db/expo';
import type { Db } from '@/db/types';

export function useDb(): Db {
  const sqlite = useSQLiteContext();
  return useMemo(() => fromExpo(sqlite), [sqlite]);
}
