export type LogType = 'weight_reps' | 'reps' | 'time' | 'cardio';
export type SetType = 'warmup' | 'working' | 'failure';
export type WeightUnit = 'kg' | 'lb';

export interface Exercise {
  id: string;
  name: string;
  category: string;
  logType: LogType;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  instructions: string[];
  description: string | null;
  isCustom: boolean;
  archived: boolean;
}

/** The measurable values of one logged set. Which fields are used depends on the exercise's LogType. */
export interface SetValues {
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
}

export interface LoggedSet extends SetValues {
  id: string;
  position: number;
  setType: SetType;
  rpe: number | null;
  completedAt: string;
}
