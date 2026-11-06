import type { Db } from '@/db/types';
import type { Exercise } from '@/domain/types';

import {
  dissolveLoneGroups,
  moveItem,
  nextPosition,
  parentOf,
  renumber,
  TEMPLATE_LIST,
  toggleSupersetWithNext,
} from './exercise-list';
import { getExercise } from './exercises';
import { getSessionDetail, startSession, toTarget, type Session, type Target } from './sessions';

export interface TemplateSummary {
  id: string;
  name: string;
  exerciseNames: string[];
}

export interface TemplateExercise {
  id: string;
  exercise: Exercise;
  position: number;
  supersetGroup: number | null;
  target: Target;
}

export interface TemplateDetail {
  id: string;
  name: string;
  notes: string | null;
  exercises: TemplateExercise[];
}

export async function listTemplates(db: Db): Promise<TemplateSummary[]> {
  const rows = await db.all<{ id: string; name: string; exercise_name: string | null }>(
    `SELECT t.id, t.name, e.name AS exercise_name
     FROM templates t
     LEFT JOIN template_exercises te ON te.template_id = t.id
     LEFT JOIN exercises e ON e.id = te.exercise_id
     WHERE t.deleted_at IS NULL
     ORDER BY t.name COLLATE NOCASE, t.id, te.position`,
  );
  const out: TemplateSummary[] = [];
  for (const r of rows) {
    let t = out.at(-1);
    if (!t || t.id !== r.id) {
      t = { id: r.id, name: r.name, exerciseNames: [] };
      out.push(t);
    }
    if (r.exercise_name) t.exerciseNames.push(r.exercise_name);
  }
  return out;
}

export async function getTemplate(db: Db, id: string): Promise<TemplateDetail | null> {
  const t = await db.first<{ id: string; name: string; notes: string | null }>(
    'SELECT id, name, notes FROM templates WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  if (!t) return null;
  const rows = await db.all<{
    id: string;
    exercise_id: string;
    position: number;
    superset_group: number | null;
    target_sets: number | null;
    target_reps_min: number | null;
    target_reps_max: number | null;
  }>(
    `SELECT id, exercise_id, position, superset_group, target_sets, target_reps_min, target_reps_max
     FROM template_exercises WHERE template_id = ? ORDER BY position`,
    [id],
  );
  const exercises: TemplateExercise[] = [];
  for (const r of rows) {
    const exercise = await getExercise(db, r.exercise_id);
    if (!exercise) continue;
    exercises.push({
      id: r.id,
      exercise,
      position: r.position,
      supersetGroup: r.superset_group,
      target: toTarget(r) ?? { sets: null, repsMin: null, repsMax: null },
    });
  }
  return { ...t, exercises };
}

export async function createTemplate(db: Db, id: string, name: string, now = new Date().toISOString()): Promise<void> {
  await db.run('INSERT INTO templates (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [
    id,
    name.trim() || 'New template',
    now,
    now,
  ]);
}

export async function renameTemplate(db: Db, id: string, name: string, now = new Date().toISOString()): Promise<void> {
  if (!name.trim()) return;
  await db.run('UPDATE templates SET name = ?, updated_at = ? WHERE id = ?', [name.trim(), now, id]);
}

/** Soft delete: workouts started from it keep their link, and sync can propagate the deletion later. */
export async function deleteTemplate(db: Db, id: string, now = new Date().toISOString()): Promise<void> {
  await db.run('UPDATE templates SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
}

export const DEFAULT_TARGET: Target = { sets: 3, repsMin: 8, repsMax: 12 };

export async function addExerciseToTemplate(
  db: Db,
  templateId: string,
  exerciseId: string,
  id: string,
  target: Target = DEFAULT_TARGET,
): Promise<void> {
  const position = await nextPosition(db, TEMPLATE_LIST, templateId);
  await db.run(
    `INSERT INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, templateId, exerciseId, position, target.sets, target.repsMin, target.repsMax],
  );
}

export async function updateTemplateTarget(db: Db, itemId: string, target: Target): Promise<void> {
  const min = target.repsMin;
  const max = target.repsMax != null && min != null && target.repsMax < min ? min : target.repsMax;
  await db.run('UPDATE template_exercises SET target_sets = ?, target_reps_min = ?, target_reps_max = ? WHERE id = ?', [
    target.sets,
    min,
    max,
    itemId,
  ]);
}

export async function removeTemplateExercise(db: Db, itemId: string): Promise<void> {
  const templateId = await parentOf(db, TEMPLATE_LIST, itemId);
  if (!templateId) return;
  await db.transaction(async () => {
    await db.run('DELETE FROM template_exercises WHERE id = ?', [itemId]);
    await renumber(db, TEMPLATE_LIST, templateId);
    await dissolveLoneGroups(db, TEMPLATE_LIST, templateId);
  });
}

export const moveTemplateExercise = (db: Db, itemId: string, direction: -1 | 1) =>
  moveItem(db, TEMPLATE_LIST, itemId, direction);

export const toggleTemplateSuperset = (db: Db, itemId: string) => toggleSupersetWithNext(db, TEMPLATE_LIST, itemId);

/**
 * Turns a finished workout into a template: same exercises, order and supersets, with
 * targets taken from what was done (number of working sets, and their rep range).
 */
export async function saveSessionAsTemplate(
  db: Db,
  sessionId: string,
  templateId: string,
  newId: () => string,
  now = new Date().toISOString(),
): Promise<void> {
  const session = await getSessionDetail(db, sessionId);
  if (!session) throw new Error('Workout not found');
  await db.transaction(async () => {
    await createTemplate(db, templateId, session.name, now);
    for (const e of session.exercises) {
      const working = e.sets.filter((s) => s.setType !== 'warmup');
      const reps = working.map((s) => s.reps).filter((r): r is number => r != null);
      const target: Target = {
        sets: working.length || null,
        repsMin: reps.length ? Math.min(...reps) : null,
        repsMax: reps.length ? Math.max(...reps) : null,
      };
      const itemId = newId();
      await db.run(
        `INSERT INTO template_exercises
           (id, template_id, exercise_id, position, superset_group, target_sets, target_reps_min, target_reps_max)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [itemId, templateId, e.exercise.id, e.position, e.supersetGroup, target.sets, target.repsMin, target.repsMax],
      );
    }
  });
}

/** Starts a workout pre-loaded with the template's exercises, order, supersets and targets. */
export async function startSessionFromTemplate(
  db: Db,
  templateId: string,
  sessionId: string,
  newId: () => string,
  now = new Date(),
): Promise<Session> {
  const t = await getTemplate(db, templateId);
  if (!t) throw new Error('Template not found');
  let session!: Session;
  await db.transaction(async () => {
    session = await startSession(db, sessionId, { name: t.name, templateId }, now);
    for (const e of t.exercises) {
      await db.run(
        `INSERT INTO session_exercises
           (id, session_id, exercise_id, position, superset_group, target_sets, target_reps_min, target_reps_max)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId(), sessionId, e.exercise.id, e.position, e.supersetGroup, e.target.sets, e.target.repsMin, e.target.repsMax],
      );
    }
  });
  return session;
}
