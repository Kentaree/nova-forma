import type { Db } from '@/db/types';
import type { Exercise, LoggedSet, SetType, SetValues } from '@/domain/types';

import { getExercise } from './exercises';

export interface Session {
  id: string;
  templateId: string | null;
  name: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
}

export interface SessionExercise {
  id: string;
  exercise: Exercise;
  position: number;
  supersetGroup: number | null;
  sets: LoggedSet[];
}

export interface SessionDetail extends Session {
  exercises: SessionExercise[];
}

interface SessionRow {
  id: string;
  template_id: string | null;
  name: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
}

interface SetRow {
  id: string;
  session_exercise_id: string;
  position: number;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  rpe: number | null;
  completed_at: string;
}

const toSession = (r: SessionRow): Session => ({
  id: r.id,
  templateId: r.template_id,
  name: r.name,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  notes: r.notes,
});

const toSet = (r: SetRow): LoggedSet => ({
  id: r.id,
  position: r.position,
  setType: r.set_type,
  weightKg: r.weight_kg,
  reps: r.reps,
  durationS: r.duration_s,
  distanceM: r.distance_m,
  rpe: r.rpe,
  completedAt: r.completed_at,
});

export function defaultSessionName(date: Date): string {
  const h = date.getHours();
  const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  return `${part} workout`;
}

export async function startSession(
  db: Db,
  id: string,
  opts: { name?: string; templateId?: string | null } = {},
  now = new Date(),
): Promise<Session> {
  await db.run(`INSERT INTO sessions (id, template_id, name, started_at) VALUES (?, ?, ?, ?)`, [
    id,
    opts.templateId ?? null,
    opts.name?.trim() || defaultSessionName(now),
    now.toISOString(),
  ]);
  return (await getSession(db, id))!;
}

export async function getSession(db: Db, id: string): Promise<Session | null> {
  const r = await db.first<SessionRow>('SELECT * FROM sessions WHERE id = ?', [id]);
  return r ? toSession(r) : null;
}

/** The unfinished session, if any. There should only ever be one. */
export async function getActiveSession(db: Db): Promise<Session | null> {
  const r = await db.first<SessionRow>(
    'SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
  );
  return r ? toSession(r) : null;
}

export async function getSessionDetail(db: Db, id: string): Promise<SessionDetail | null> {
  const session = await getSession(db, id);
  if (!session) return null;
  const rows = await db.all<{ id: string; exercise_id: string; position: number; superset_group: number | null }>(
    'SELECT id, exercise_id, position, superset_group FROM session_exercises WHERE session_id = ? ORDER BY position',
    [id],
  );
  const sets = await db.all<SetRow>(
    `SELECT s.* FROM sets s JOIN session_exercises se ON se.id = s.session_exercise_id
     WHERE se.session_id = ? ORDER BY s.position`,
    [id],
  );
  const exercises: SessionExercise[] = [];
  for (const r of rows) {
    const exercise = await getExercise(db, r.exercise_id);
    if (!exercise) continue;
    exercises.push({
      id: r.id,
      exercise,
      position: r.position,
      supersetGroup: r.superset_group,
      sets: sets.filter((s) => s.session_exercise_id === r.id).map(toSet),
    });
  }
  return { ...session, exercises };
}

export async function addExerciseToSession(db: Db, sessionId: string, exerciseId: string, id: string): Promise<void> {
  const { next } = (await db.first<{ next: number }>(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM session_exercises WHERE session_id = ?',
    [sessionId],
  ))!;
  await db.run(`INSERT INTO session_exercises (id, session_id, exercise_id, position) VALUES (?, ?, ?, ?)`, [
    id,
    sessionId,
    exerciseId,
    next,
  ]);
}

export async function removeSessionExercise(db: Db, sessionExerciseId: string): Promise<void> {
  const row = await db.first<{ session_id: string }>('SELECT session_id FROM session_exercises WHERE id = ?', [
    sessionExerciseId,
  ]);
  if (!row) return;
  await db.transaction(async () => {
    await db.run('DELETE FROM sets WHERE session_exercise_id = ?', [sessionExerciseId]);
    await db.run('DELETE FROM session_exercises WHERE id = ?', [sessionExerciseId]);
    await renumber(db, row.session_id);
    await dissolveLoneGroups(db, row.session_id);
  });
}

/** Moves an exercise one place up (-1) or down (+1). */
export async function moveSessionExercise(db: Db, sessionExerciseId: string, direction: -1 | 1): Promise<void> {
  const row = await db.first<{ session_id: string; position: number }>(
    'SELECT session_id, position FROM session_exercises WHERE id = ?',
    [sessionExerciseId],
  );
  if (!row) return;
  const other = await db.first<{ id: string }>(
    'SELECT id FROM session_exercises WHERE session_id = ? AND position = ?',
    [row.session_id, row.position + direction],
  );
  if (!other) return;
  await db.transaction(async () => {
    await db.run('UPDATE session_exercises SET position = ? WHERE id = ?', [row.position, other.id]);
    await db.run('UPDATE session_exercises SET position = ? WHERE id = ?', [row.position + direction, sessionExerciseId]);
  });
}

/**
 * Toggles a superset link between this exercise and the next one. Linking joins the next
 * exercise (and its group, if any) into this one's group; unlinking splits the group here.
 */
export async function toggleSupersetWithNext(db: Db, sessionExerciseId: string): Promise<void> {
  const rows = await db.all<{ id: string; superset_group: number | null; session_id: string }>(
    `SELECT id, superset_group, session_id FROM session_exercises
     WHERE session_id = (SELECT session_id FROM session_exercises WHERE id = ?) ORDER BY position`,
    [sessionExerciseId],
  );
  const i = rows.findIndex((r) => r.id === sessionExerciseId);
  const cur = rows[i];
  const next = rows[i + 1];
  if (!cur || !next) return;

  await db.transaction(async () => {
    const linked = cur.superset_group != null && cur.superset_group === next.superset_group;
    if (linked) {
      // Split: everything after `cur` in this group gets a fresh group.
      const fresh = await nextGroup(db, cur.session_id);
      for (const r of rows.slice(i + 1)) {
        if (r.superset_group !== cur.superset_group) break;
        await db.run('UPDATE session_exercises SET superset_group = ? WHERE id = ?', [fresh, r.id]);
      }
    } else {
      const group = cur.superset_group ?? (await nextGroup(db, cur.session_id));
      await db.run('UPDATE session_exercises SET superset_group = ? WHERE id = ?', [group, cur.id]);
      const absorb = next.superset_group;
      for (const r of rows.slice(i + 1)) {
        if (r.id !== next.id && (absorb == null || r.superset_group !== absorb)) break;
        await db.run('UPDATE session_exercises SET superset_group = ? WHERE id = ?', [group, r.id]);
      }
    }
    await dissolveLoneGroups(db, cur.session_id);
  });
}

async function nextGroup(db: Db, sessionId: string): Promise<number> {
  const { g } = (await db.first<{ g: number }>(
    'SELECT COALESCE(MAX(superset_group), 0) + 1 AS g FROM session_exercises WHERE session_id = ?',
    [sessionId],
  ))!;
  return g;
}

async function renumber(db: Db, sessionId: string): Promise<void> {
  const rows = await db.all<{ id: string }>(
    'SELECT id FROM session_exercises WHERE session_id = ? ORDER BY position',
    [sessionId],
  );
  for (let i = 0; i < rows.length; i++) {
    await db.run('UPDATE session_exercises SET position = ? WHERE id = ?', [i, rows[i].id]);
  }
}

/** A "superset" of one exercise isn't one. */
async function dissolveLoneGroups(db: Db, sessionId: string): Promise<void> {
  await db.run(
    `UPDATE session_exercises SET superset_group = NULL
     WHERE session_id = ? AND superset_group IN (
       SELECT superset_group FROM session_exercises WHERE session_id = ? AND superset_group IS NOT NULL
       GROUP BY superset_group HAVING COUNT(*) < 2)`,
    [sessionId, sessionId],
  );
}

export async function logSet(
  db: Db,
  sessionExerciseId: string,
  values: SetValues & { setType?: SetType; rpe?: number | null },
  id: string,
  now = new Date(),
): Promise<LoggedSet> {
  const { next } = (await db.first<{ next: number }>(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM sets WHERE session_exercise_id = ?',
    [sessionExerciseId],
  ))!;
  await db.run(
    `INSERT INTO sets (id, session_exercise_id, position, set_type, weight_kg, reps, duration_s, distance_m, rpe, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      sessionExerciseId,
      next,
      values.setType ?? 'working',
      values.weightKg,
      values.reps,
      values.durationS,
      values.distanceM,
      values.rpe ?? null,
      now.toISOString(),
    ],
  );
  return toSet((await db.first<SetRow>('SELECT * FROM sets WHERE id = ?', [id]))!);
}

export async function updateSet(
  db: Db,
  setId: string,
  patch: Partial<SetValues> & { setType?: SetType; rpe?: number | null },
): Promise<void> {
  const cols: [string, keyof typeof patch][] = [
    ['weight_kg', 'weightKg'],
    ['reps', 'reps'],
    ['duration_s', 'durationS'],
    ['distance_m', 'distanceM'],
    ['set_type', 'setType'],
    ['rpe', 'rpe'],
  ];
  const sets = cols.filter(([, k]) => k in patch);
  if (!sets.length) return;
  await db.run(`UPDATE sets SET ${sets.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`, [
    ...sets.map(([, k]) => (patch[k] ?? null) as number | string | null),
    setId,
  ]);
}

export async function deleteSet(db: Db, setId: string): Promise<void> {
  const row = await db.first<{ session_exercise_id: string }>('SELECT session_exercise_id FROM sets WHERE id = ?', [setId]);
  if (!row) return;
  await db.transaction(async () => {
    await db.run('DELETE FROM sets WHERE id = ?', [setId]);
    const rest = await db.all<{ id: string }>('SELECT id FROM sets WHERE session_exercise_id = ? ORDER BY position', [
      row.session_exercise_id,
    ]);
    for (let i = 0; i < rest.length; i++) await db.run('UPDATE sets SET position = ? WHERE id = ?', [i, rest[i].id]);
  });
}

/**
 * Finishes the session. Exercises with no logged sets are dropped, and a session with
 * nothing logged at all is deleted rather than kept as an empty entry in history.
 * Returns false if the session was deleted.
 */
export async function finishSession(db: Db, id: string, now = new Date()): Promise<boolean> {
  let kept = true;
  await db.transaction(async () => {
    await db.run(
      `DELETE FROM session_exercises WHERE session_id = ?
       AND NOT EXISTS (SELECT 1 FROM sets WHERE sets.session_exercise_id = session_exercises.id)`,
      [id],
    );
    const { n } = (await db.first<{ n: number }>('SELECT COUNT(*) n FROM session_exercises WHERE session_id = ?', [id]))!;
    if (n === 0) {
      await db.run('DELETE FROM sessions WHERE id = ?', [id]);
      kept = false;
    } else {
      await renumber(db, id);
      await dissolveLoneGroups(db, id);
      await db.run('UPDATE sessions SET ended_at = ? WHERE id = ?', [now.toISOString(), id]);
    }
  });
  return kept;
}

export async function discardSession(db: Db, id: string): Promise<void> {
  await db.transaction(async () => {
    await db.run(
      'DELETE FROM sets WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id = ?)',
      [id],
    );
    await db.run('DELETE FROM session_exercises WHERE session_id = ?', [id]);
    await db.run('DELETE FROM sessions WHERE id = ?', [id]);
  });
}

/**
 * The sets from the most recent *other* session in which this exercise was logged,
 * plus when that was. Used for "last time" and to pre-fill today's sets.
 */
export async function lastPerformance(
  db: Db,
  exerciseId: string,
  excludeSessionId: string,
): Promise<{ date: string; sets: LoggedSet[] } | null> {
  const se = await db.first<{ id: string; started_at: string }>(
    `SELECT se.id, s.started_at FROM session_exercises se JOIN sessions s ON s.id = se.session_id
     WHERE se.exercise_id = ? AND se.session_id != ?
       AND EXISTS (SELECT 1 FROM sets WHERE sets.session_exercise_id = se.id)
     ORDER BY s.started_at DESC, se.position DESC LIMIT 1`,
    [exerciseId, excludeSessionId],
  );
  if (!se) return null;
  const sets = await db.all<SetRow>('SELECT * FROM sets WHERE session_exercise_id = ? ORDER BY position', [se.id]);
  return { date: se.started_at, sets: sets.map(toSet) };
}
