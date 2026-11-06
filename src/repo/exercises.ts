import type { Db } from '@/db/types';
import type { Exercise, LogType } from '@/domain/types';

interface ExerciseRow {
  id: string;
  name: string;
  category: string;
  log_type: LogType;
  primary_muscles: string;
  secondary_muscles: string;
  equipment: string;
  instructions: string;
  description: string | null;
  is_custom: number;
  archived: number;
}

function toExercise(r: ExerciseRow): Exercise {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    logType: r.log_type,
    primaryMuscles: JSON.parse(r.primary_muscles),
    secondaryMuscles: JSON.parse(r.secondary_muscles),
    equipment: JSON.parse(r.equipment),
    instructions: JSON.parse(r.instructions),
    description: r.description,
    isCustom: r.is_custom === 1,
    archived: r.archived === 1,
  };
}

export interface ExerciseQuery {
  search?: string;
  muscle?: string;
  includeArchived?: boolean;
}

export async function listExercises(db: Db, q: ExerciseQuery = {}): Promise<Exercise[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (!q.includeArchived) where.push('archived = 0');
  if (q.search?.trim()) {
    where.push(`name LIKE ? ESCAPE '\\'`);
    params.push(`%${q.search.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`);
  }
  if (q.muscle) {
    where.push(`EXISTS (SELECT 1 FROM json_each(primary_muscles) WHERE value = ?)`);
    params.push(q.muscle);
  }
  const rows = await db.all<ExerciseRow>(
    `SELECT * FROM exercises ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name COLLATE NOCASE`,
    params,
  );
  return rows.map(toExercise);
}

export async function getExercise(db: Db, id: string): Promise<Exercise | null> {
  const row = await db.first<ExerciseRow>('SELECT * FROM exercises WHERE id = ?', [id]);
  return row ? toExercise(row) : null;
}

/** Every primary muscle group in the library, for filter chips. */
export async function listMuscles(db: Db): Promise<string[]> {
  const rows = await db.all<{ value: string }>(
    `SELECT DISTINCT j.value FROM exercises e, json_each(e.primary_muscles) j
     WHERE e.archived = 0 ORDER BY j.value`,
  );
  return rows.map((r) => r.value);
}

export interface NewCustomExercise {
  name: string;
  logType: LogType;
  primaryMuscles: string[];
}

export async function createCustomExercise(
  db: Db,
  input: NewCustomExercise,
  id: string,
  now = new Date().toISOString(),
): Promise<Exercise> {
  const name = input.name.trim();
  if (!name) throw new Error('Exercise name is required');
  const clash = await db.first<{ id: string }>(
    'SELECT id FROM exercises WHERE name = ? COLLATE NOCASE AND archived = 0',
    [name],
  );
  if (clash) throw new Error(`An exercise called "${name}" already exists`);
  await db.run(
    `INSERT INTO exercises (id, name, category, log_type, primary_muscles, is_custom, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, name, input.logType === 'cardio' ? 'cardio' : 'strength', input.logType, JSON.stringify(input.primaryMuscles), now, now],
  );
  return (await getExercise(db, id))!;
}
