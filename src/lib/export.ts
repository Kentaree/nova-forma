import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { Db } from '@/db/types';
import { exportCsv } from '@/repo/history';

/** Writes all finished workouts to a CSV and opens the share sheet (save to Files, email, Drive...). */
export async function shareWorkoutsCsv(db: Db): Promise<void> {
  const csv = await exportCsv(db);
  const name = `nova-forma-workouts-${new Date().toISOString().slice(0, 10)}.csv`;

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Export workouts' });
}
