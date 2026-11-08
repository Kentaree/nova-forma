import type { Db, SqlValue } from '@/db/types';

import {
  SYNC_PROTOCOL_VERSION,
  type ExerciseDoc,
  type SessionDoc,
  type SyncRequest,
  type SyncResponse,
  type TemplateDoc,
} from '../../shared/sync-protocol';

/** Sends one sync request to the server. Injected so tests can use an in-process server. */
export type SyncTransport = (req: SyncRequest) => Promise<SyncResponse>;

export interface SyncResult {
  pushed: number;
  pulled: number;
}

type Kind = 'exercise' | 'template' | 'session';
interface DirtyRow {
  kind: Kind;
  id: string;
  rev: number;
}

const parseList = (s: string) => JSON.parse(s) as string[];

/**
 * One round trip: push everything changed on this phone, then apply everything the
 * server has that this phone hasn't seen. Safe to call at any time; a failure leaves
 * local data untouched and the changes are retried on the next sync.
 */
export async function runSync(db: Db, transport: SyncTransport, now = new Date()): Promise<SyncResult> {
  const state = (await db.first<{ cursor: number }>('SELECT cursor FROM sync_state WHERE id = 1'))!;
  const dirty = await db.all<DirtyRow>('SELECT kind, id, rev FROM sync_dirty');

  const req: SyncRequest = { protocol: SYNC_PROTOCOL_VERSION, cursor: state.cursor, exercises: [], templates: [], sessions: [] };
  for (const d of dirty) {
    if (d.kind === 'exercise') {
      const doc = await exerciseDoc(db, d.id);
      if (doc) req.exercises.push(doc);
    } else if (d.kind === 'template') {
      const doc = await templateDoc(db, d.id);
      if (doc) req.templates.push(doc);
    } else {
      const doc = await sessionDoc(db, d.id);
      if (doc) req.sessions.push(doc);
    }
  }

  const res = await transport(req);

  let pulled = 0;
  await db.transaction(async () => {
    await db.run('UPDATE sync_state SET applying = 1 WHERE id = 1');
    for (const doc of res.exercises) if (await applyExercise(db, doc)) pulled++;
    for (const doc of res.templates) if (await applyTemplate(db, doc)) pulled++;
    for (const doc of res.sessions) if (await applySession(db, doc)) pulled++;
    // Clear what was pushed, unless it changed again while the request was in flight.
    for (const d of dirty) {
      await db.run('DELETE FROM sync_dirty WHERE kind = ? AND id = ? AND rev = ?', [d.kind, d.id, d.rev]);
    }
    await db.run(
      `DELETE FROM sync_tombstones WHERE id NOT IN (SELECT id FROM sync_dirty WHERE kind = 'session')`,
    );
    await db.run('UPDATE sync_state SET applying = 0, cursor = ?, last_synced_at = ? WHERE id = 1', [
      res.cursor,
      now.toISOString(),
    ]);
  });

  const pushed = req.exercises.length + req.templates.length + req.sessions.length;
  return { pushed, pulled };
}

export async function getSyncState(db: Db): Promise<{ lastSyncedAt: string | null; pending: number }> {
  const s = (await db.first<{ last_synced_at: string | null }>('SELECT last_synced_at FROM sync_state WHERE id = 1'))!;
  const { n } = (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM sync_dirty'))!;
  return { lastSyncedAt: s.last_synced_at, pending: n };
}

/**
 * Prepare for a new server: forget the old position and queue everything on this phone
 * for upload, so the new server gets a full copy.
 */
export async function startFresh(db: Db): Promise<void> {
  await db.transaction(async () => {
    await db.run('UPDATE sync_state SET cursor = 0, last_synced_at = NULL WHERE id = 1');
    await db.run(`INSERT OR IGNORE INTO sync_dirty (kind, id) SELECT 'exercise', id FROM exercises WHERE is_custom = 1`);
    await db.run(`INSERT OR IGNORE INTO sync_dirty (kind, id) SELECT 'template', id FROM templates`);
    await db.run(`INSERT OR IGNORE INTO sync_dirty (kind, id) SELECT 'session', id FROM sessions WHERE ended_at IS NOT NULL`);
  });
}

// ---------------------------------------------------------------------------
// Building documents from local rows

async function exerciseDoc(db: Db, id: string): Promise<ExerciseDoc | null> {
  const r = await db.first<{
    id: string;
    name: string;
    category: string;
    log_type: ExerciseDoc['logType'];
    primary_muscles: string;
    secondary_muscles: string;
    equipment: string;
    instructions: string;
    description: string | null;
    archived: number;
    updated_at: string;
  }>('SELECT * FROM exercises WHERE id = ? AND is_custom = 1', [id]);
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    logType: r.log_type,
    primaryMuscles: parseList(r.primary_muscles),
    secondaryMuscles: parseList(r.secondary_muscles),
    equipment: parseList(r.equipment),
    instructions: parseList(r.instructions),
    description: r.description,
    archived: r.archived === 1,
    updatedAt: r.updated_at,
    deletedAt: null,
  };
}

interface ItemRow {
  id: string;
  exercise_id: string;
  position: number;
  superset_group: number | null;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
}

const item = (r: ItemRow) => ({
  id: r.id,
  exerciseId: r.exercise_id,
  position: r.position,
  supersetGroup: r.superset_group,
  targetSets: r.target_sets,
  targetRepsMin: r.target_reps_min,
  targetRepsMax: r.target_reps_max,
});

async function templateDoc(db: Db, id: string): Promise<TemplateDoc | null> {
  const t = await db.first<{
    id: string;
    name: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }>('SELECT * FROM templates WHERE id = ?', [id]);
  if (!t) return null;
  const items = t.deleted_at
    ? []
    : await db.all<ItemRow>('SELECT * FROM template_exercises WHERE template_id = ? ORDER BY position', [id]);
  return {
    id: t.id,
    name: t.name,
    notes: t.notes,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    deletedAt: t.deleted_at,
    exercises: items.map(item),
  };
}

async function sessionDoc(db: Db, id: string): Promise<SessionDoc | null> {
  const s = await db.first<{
    id: string;
    template_id: string | null;
    name: string;
    started_at: string;
    ended_at: string | null;
    notes: string | null;
    updated_at: string;
  }>('SELECT * FROM sessions WHERE id = ?', [id]);
  if (!s) {
    const t = await db.first<{ id: string; template_id: string | null; name: string; started_at: string; deleted_at: string }>(
      'SELECT * FROM sync_tombstones WHERE id = ?',
      [id],
    );
    if (!t) return null;
    return {
      id: t.id,
      templateId: t.template_id,
      name: t.name,
      startedAt: t.started_at,
      endedAt: null,
      notes: null,
      updatedAt: t.deleted_at,
      deletedAt: t.deleted_at,
      exercises: [],
    };
  }
  if (!s.ended_at) return null; // workouts in progress don't sync
  const items = await db.all<ItemRow>('SELECT * FROM session_exercises WHERE session_id = ? ORDER BY position', [id]);
  const sets = await db.all<{
    id: string;
    session_exercise_id: string;
    position: number;
    set_type: 'warmup' | 'working' | 'failure';
    weight_kg: number | null;
    reps: number | null;
    duration_s: number | null;
    distance_m: number | null;
    rpe: number | null;
    completed_at: string;
  }>(
    `SELECT st.* FROM sets st JOIN session_exercises se ON se.id = st.session_exercise_id
     WHERE se.session_id = ? ORDER BY st.position`,
    [id],
  );
  return {
    id: s.id,
    templateId: s.template_id,
    name: s.name,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    notes: s.notes,
    updatedAt: s.updated_at,
    deletedAt: null,
    exercises: items.map((r) => ({
      ...item(r),
      sets: sets
        .filter((x) => x.session_exercise_id === r.id)
        .map((x) => ({
          id: x.id,
          position: x.position,
          setType: x.set_type,
          weightKg: x.weight_kg,
          reps: x.reps,
          durationS: x.duration_s,
          distanceM: x.distance_m,
          rpe: x.rpe,
          completedAt: x.completed_at,
        })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Applying pulled documents (runs with the sync triggers switched off)

/** Is the incoming copy newer than the local one? Ties keep the local copy: it's the one we pushed. */
async function isNewer(db: Db, table: string, id: string, updatedAt: string): Promise<boolean> {
  const row = await db.first<{ updated_at: string | null }>(`SELECT updated_at FROM ${table} WHERE id = ?`, [id]);
  return !row || !row.updated_at || Date.parse(updatedAt) > Date.parse(row.updated_at);
}

/** Pulled data can name an exercise this phone doesn't have (e.g. a newer built-in library). */
async function ensureExercise(db: Db, id: string, now: string): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO exercises (id, name, category, log_type, is_custom, created_at, updated_at)
     VALUES (?, 'Unknown exercise', 'other', 'weight_reps', 1, ?, ?)`,
    [id, now, now],
  );
}

async function applyExercise(db: Db, d: ExerciseDoc): Promise<boolean> {
  const local = await db.first<{ is_custom: number }>('SELECT is_custom FROM exercises WHERE id = ?', [d.id]);
  if (local && local.is_custom === 0) return false; // the built-in library is never overwritten
  if (!(await isNewer(db, 'exercises', d.id, d.updatedAt))) return false;
  const json = (v: string[]) => JSON.stringify(v);
  await db.run(
    `INSERT INTO exercises (id, name, category, log_type, primary_muscles, secondary_muscles, equipment, instructions,
       description, is_custom, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name, category = excluded.category, log_type = excluded.log_type,
       primary_muscles = excluded.primary_muscles, secondary_muscles = excluded.secondary_muscles,
       equipment = excluded.equipment, instructions = excluded.instructions, description = excluded.description,
       archived = excluded.archived, updated_at = excluded.updated_at`,
    [
      d.id,
      d.name,
      d.category,
      d.logType,
      json(d.primaryMuscles),
      json(d.secondaryMuscles),
      json(d.equipment),
      json(d.instructions),
      d.description,
      d.archived || d.deletedAt ? 1 : 0,
      d.updatedAt,
      d.updatedAt,
    ],
  );
  return true;
}

async function applyTemplate(db: Db, d: TemplateDoc): Promise<boolean> {
  if (!(await isNewer(db, 'templates', d.id, d.updatedAt))) return false;
  await db.run(
    `INSERT INTO templates (id, name, notes, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, notes = excluded.notes,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
    [d.id, d.name, d.notes, d.createdAt, d.updatedAt, d.deletedAt],
  );
  await db.run('DELETE FROM template_exercises WHERE template_id = ?', [d.id]);
  if (d.deletedAt) return true;
  for (const e of d.exercises) {
    await ensureExercise(db, e.exerciseId, d.updatedAt);
    await db.run(
      `INSERT INTO template_exercises
         (id, template_id, exercise_id, position, superset_group, target_sets, target_reps_min, target_reps_max)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, d.id, e.exerciseId, e.position, e.supersetGroup, e.targetSets, e.targetRepsMin, e.targetRepsMax],
    );
  }
  return true;
}

async function applySession(db: Db, d: SessionDoc): Promise<boolean> {
  const deleteChildren = async () => {
    await db.run('DELETE FROM sets WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id = ?)', [
      d.id,
    ]);
    await db.run('DELETE FROM session_exercises WHERE session_id = ?', [d.id]);
  };

  if (d.deletedAt) {
    const exists = await db.first('SELECT 1 FROM sessions WHERE id = ?', [d.id]);
    if (!exists) return false;
    await deleteChildren();
    await db.run('DELETE FROM sessions WHERE id = ?', [d.id]);
    return true;
  }
  if (!(await isNewer(db, 'sessions', d.id, d.updatedAt))) return false;

  const template = d.templateId && (await db.first('SELECT 1 FROM templates WHERE id = ?', [d.templateId]));
  await db.run(
    `INSERT INTO sessions (id, template_id, name, started_at, ended_at, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET template_id = excluded.template_id, name = excluded.name,
       started_at = excluded.started_at, ended_at = excluded.ended_at, notes = excluded.notes,
       updated_at = excluded.updated_at`,
    [d.id, template ? d.templateId : null, d.name, d.startedAt, d.endedAt, d.notes, d.updatedAt],
  );
  await db.run('DELETE FROM sync_tombstones WHERE id = ?', [d.id]);
  await deleteChildren();
  for (const e of d.exercises) {
    await ensureExercise(db, e.exerciseId, d.updatedAt);
    await db.run(
      `INSERT INTO session_exercises
         (id, session_id, exercise_id, position, superset_group, target_sets, target_reps_min, target_reps_max)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, d.id, e.exerciseId, e.position, e.supersetGroup, e.targetSets, e.targetRepsMin, e.targetRepsMax],
    );
    for (const s of e.sets) {
      const params: SqlValue[] = [
        s.id,
        e.id,
        s.position,
        s.setType,
        s.weightKg,
        s.reps,
        s.durationS,
        s.distanceM,
        s.rpe,
        s.completedAt,
      ];
      await db.run(
        `INSERT INTO sets (id, session_exercise_id, position, set_type, weight_kg, reps, duration_s, distance_m, rpe, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params,
      );
    }
  }
  return true;
}
