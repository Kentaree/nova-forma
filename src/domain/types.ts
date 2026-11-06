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
