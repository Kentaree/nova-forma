/**
 * Wire format between the app and the Nova Forma sync server (server/).
 * Plain types only, no dependencies, so both sides can import this file.
 *
 * Sync is document-based and last-write-wins on `updatedAt`:
 * - an exercise (custom ones only; the built-in library ships with the app),
 * - a template with its exercises and targets,
 * - a finished workout with its exercises and sets.
 * A document with `deletedAt` set is a tombstone: its children are gone.
 *
 * The server stamps every accepted change with an increasing sequence number.
 * A client sends its `cursor` (the last sequence it has seen) and receives every
 * document changed after it, plus the new cursor.
 */

export const SYNC_PROTOCOL_VERSION = 1;

export type LogType = 'weight_reps' | 'reps' | 'time' | 'cardio';
export type SetType = 'warmup' | 'working' | 'failure';

export interface ExerciseDoc {
  id: string;
  name: string;
  category: string;
  logType: LogType;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  instructions: string[];
  description: string | null;
  archived: boolean;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TemplateExerciseDoc {
  id: string;
  exerciseId: string;
  position: number;
  supersetGroup: number | null;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
}

export interface TemplateDoc {
  id: string;
  name: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  exercises: TemplateExerciseDoc[];
}

export interface SetDoc {
  id: string;
  position: number;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
  rpe: number | null;
  completedAt: string;
}

export interface SessionExerciseDoc {
  id: string;
  exerciseId: string;
  position: number;
  supersetGroup: number | null;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  sets: SetDoc[];
}

export interface SessionDoc {
  id: string;
  templateId: string | null;
  name: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  updatedAt: string;
  deletedAt: string | null;
  exercises: SessionExerciseDoc[];
}

export interface SyncRequest {
  protocol: number;
  cursor: number;
  exercises: ExerciseDoc[];
  templates: TemplateDoc[];
  sessions: SessionDoc[];
}

export interface SyncResponse {
  cursor: number;
  exercises: ExerciseDoc[];
  templates: TemplateDoc[];
  sessions: SessionDoc[];
}
