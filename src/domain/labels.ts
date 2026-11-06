import type { LogType } from './types';

export const LOG_TYPE_LABELS: Record<LogType, string> = {
  weight_reps: 'Weight × reps',
  reps: 'Reps',
  time: 'Time',
  cardio: 'Distance / time',
};

export function titleCase(s: string): string {
  return s.replace(/(^|[\s-])\w/g, (m) => m.toUpperCase());
}
