import { DEFAULT_SETTINGS, getSettings } from '@/repo/settings';

import { useDb } from './use-db';
import { useQuery } from './use-query';

export function useSettings() {
  const db = useDb();
  return useQuery(() => getSettings(db)).data ?? DEFAULT_SETTINGS;
}
