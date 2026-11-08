import { z } from 'zod';

import { SYNC_PROTOCOL_VERSION, type SyncRequest } from '../../shared/sync-protocol';

const id = z.string().min(1).max(64);
const iso = z.string().min(10).max(40);
const int = z.number().int();
const nullableInt = int.nullable();
const nullableNum = z.number().finite().nullable();
const strList = z.array(z.string().max(200)).max(100);

const exercise = z.object({
  id,
  name: z.string().min(1).max(200),
  category: z.string().max(50),
  logType: z.enum(['weight_reps', 'reps', 'time', 'cardio']),
  primaryMuscles: strList,
  secondaryMuscles: strList,
  equipment: strList,
  instructions: z.array(z.string().max(2000)).max(50),
  description: z.string().max(5000).nullable(),
  archived: z.boolean(),
  updatedAt: iso,
  deletedAt: iso.nullable(),
});

const templateExercise = z.object({
  id,
  exerciseId: id,
  position: int.min(0),
  supersetGroup: nullableInt,
  targetSets: nullableInt,
  targetRepsMin: nullableInt,
  targetRepsMax: nullableInt,
});

const template = z.object({
  id,
  name: z.string().min(1).max(200),
  notes: z.string().max(5000).nullable(),
  createdAt: iso,
  updatedAt: iso,
  deletedAt: iso.nullable(),
  exercises: z.array(templateExercise).max(100),
});

const set = z.object({
  id,
  position: int.min(0),
  setType: z.enum(['warmup', 'working', 'failure']),
  weightKg: nullableNum,
  reps: nullableInt,
  durationS: nullableInt,
  distanceM: nullableNum,
  rpe: nullableNum,
  completedAt: iso,
});

const session = z.object({
  id,
  templateId: id.nullable(),
  name: z.string().min(1).max(200),
  startedAt: iso,
  endedAt: iso.nullable(),
  notes: z.string().max(5000).nullable(),
  updatedAt: iso,
  deletedAt: iso.nullable(),
  exercises: z
    .array(templateExercise.omit({}).extend({ sets: z.array(set).max(100) }))
    .max(100),
});

export const syncRequest = z.object({
  protocol: z.literal(SYNC_PROTOCOL_VERSION),
  cursor: int.min(0),
  exercises: z.array(exercise).max(1000),
  templates: z.array(template).max(1000),
  sessions: z.array(session).max(2000),
}) satisfies z.ZodType<SyncRequest>;
