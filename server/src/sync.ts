import type {
  ExerciseDoc,
  SessionDoc,
  SyncRequest,
  SyncResponse,
  TemplateDoc,
} from '../../shared/sync-protocol';
import type { Statement, Store } from './store';

/**
 * Each accepted document bumps the global sequence and is stamped with the new value,
 * all inside the same batch, so concurrent syncs can't hand out the same number.
 */
const BUMP: Statement = { sql: `UPDATE meta SET value = value + 1 WHERE key = 'seq'`, params: [] };
const SEQ = `(SELECT value FROM meta WHERE key = 'seq')`;

const json = (v: unknown) => JSON.stringify(v);

/** Is `incoming` newer than what's stored? Ties keep the stored copy (it's identical or arrived first). */
async function isNewer(store: Store, table: string, id: string, updatedAt: string): Promise<boolean> {
  const row = await store.first<{ updated_at: string }>(`SELECT updated_at FROM ${table} WHERE id = ?`, [id]);
  return !row || Date.parse(updatedAt) > Date.parse(row.updated_at);
}

function exerciseStatements(d: ExerciseDoc): Statement[] {
  return [
    BUMP,
    {
      sql: `INSERT INTO exercises (id, name, category, log_type, primary_muscles, secondary_muscles, equipment,
              instructions, description, archived, updated_at, deleted_at, seq)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${SEQ})
            ON CONFLICT (id) DO UPDATE SET
              name = excluded.name, category = excluded.category, log_type = excluded.log_type,
              primary_muscles = excluded.primary_muscles, secondary_muscles = excluded.secondary_muscles,
              equipment = excluded.equipment, instructions = excluded.instructions,
              description = excluded.description, archived = excluded.archived,
              updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, seq = excluded.seq`,
      params: [
        d.id,
        d.name,
        d.category,
        d.logType,
        json(d.primaryMuscles),
        json(d.secondaryMuscles),
        json(d.equipment),
        json(d.instructions),
        d.description,
        d.archived ? 1 : 0,
        d.updatedAt,
        d.deletedAt,
      ],
    },
  ];
}

function templateStatements(d: TemplateDoc): Statement[] {
  const out: Statement[] = [
    BUMP,
    { sql: 'DELETE FROM template_exercises WHERE template_id = ?', params: [d.id] },
    {
      sql: `INSERT INTO templates (id, name, notes, created_at, updated_at, deleted_at, seq)
            VALUES (?, ?, ?, ?, ?, ?, ${SEQ})
            ON CONFLICT (id) DO UPDATE SET
              name = excluded.name, notes = excluded.notes, updated_at = excluded.updated_at,
              deleted_at = excluded.deleted_at, seq = excluded.seq`,
      params: [d.id, d.name, d.notes, d.createdAt, d.updatedAt, d.deletedAt],
    },
  ];
  if (d.deletedAt) return out;
  for (const e of d.exercises) {
    out.push({
      sql: `INSERT INTO template_exercises
              (id, template_id, exercise_id, position, superset_group, target_sets, target_reps_min, target_reps_max)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [e.id, d.id, e.exerciseId, e.position, e.supersetGroup, e.targetSets, e.targetRepsMin, e.targetRepsMax],
    });
  }
  return out;
}

function sessionStatements(d: SessionDoc): Statement[] {
  const out: Statement[] = [
    BUMP,
    {
      sql: `DELETE FROM sets WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id = ?)`,
      params: [d.id],
    },
    { sql: 'DELETE FROM session_exercises WHERE session_id = ?', params: [d.id] },
    {
      sql: `INSERT INTO sessions (id, template_id, name, started_at, ended_at, notes, updated_at, deleted_at, seq)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${SEQ})
            ON CONFLICT (id) DO UPDATE SET
              template_id = excluded.template_id, name = excluded.name, started_at = excluded.started_at,
              ended_at = excluded.ended_at, notes = excluded.notes, updated_at = excluded.updated_at,
              deleted_at = excluded.deleted_at, seq = excluded.seq`,
      params: [d.id, d.templateId, d.name, d.startedAt, d.endedAt, d.notes, d.updatedAt, d.deletedAt],
    },
  ];
  if (d.deletedAt) return out;
  for (const e of d.exercises) {
    out.push({
      sql: `INSERT INTO session_exercises
              (id, session_id, exercise_id, position, superset_group, target_sets, target_reps_min, target_reps_max)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [e.id, d.id, e.exerciseId, e.position, e.supersetGroup, e.targetSets, e.targetRepsMin, e.targetRepsMax],
    });
    for (const s of e.sets) {
      out.push({
        sql: `INSERT INTO sets (id, session_exercise_id, position, set_type, weight_kg, reps, duration_s, distance_m, rpe, completed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [s.id, e.id, s.position, s.setType, s.weightKg, s.reps, s.durationS, s.distanceM, s.rpe, s.completedAt],
      });
    }
  }
  return out;
}

/** Applies the client's documents (newer-wins) and returns how many were accepted. */
export async function applyChanges(store: Store, req: SyncRequest): Promise<number> {
  const statements: Statement[] = [];
  let accepted = 0;
  for (const d of req.exercises) {
    if (await isNewer(store, 'exercises', d.id, d.updatedAt)) {
      statements.push(...exerciseStatements(d));
      accepted++;
    }
  }
  for (const d of req.templates) {
    if (await isNewer(store, 'templates', d.id, d.updatedAt)) {
      statements.push(...templateStatements(d));
      accepted++;
    }
  }
  for (const d of req.sessions) {
    if (await isNewer(store, 'sessions', d.id, d.updatedAt)) {
      statements.push(...sessionStatements(d));
      accepted++;
    }
  }
  await store.batch(statements);
  return accepted;
}

const parseList = (s: string) => JSON.parse(s) as string[];

/** Every document changed after `cursor`, and the cursor to use next time. */
export async function changesSince(store: Store, cursor: number): Promise<SyncResponse> {
  const head = (await store.first<{ value: number }>(`SELECT value FROM meta WHERE key = 'seq'`))!.value;

  const exRows = await store.all<{
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
    deleted_at: string | null;
  }>('SELECT * FROM exercises WHERE seq > ? AND seq <= ? ORDER BY seq', [cursor, head]);
  const exercises: ExerciseDoc[] = exRows.map((r) => ({
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
    deletedAt: r.deleted_at,
  }));

  const templates: TemplateDoc[] = [];
  const tRows = await store.all<{
    id: string;
    name: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }>('SELECT * FROM templates WHERE seq > ? AND seq <= ? ORDER BY seq', [cursor, head]);
  for (const t of tRows) templates.push(await templateDoc(store, t));

  const sessions: SessionDoc[] = [];
  const sRows = await store.all<SessionRow>('SELECT * FROM sessions WHERE seq > ? AND seq <= ? ORDER BY seq', [
    cursor,
    head,
  ]);
  for (const s of sRows) sessions.push(await sessionDoc(store, s));

  return { cursor: head, exercises, templates, sessions };
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

export async function templateDoc(
  store: Store,
  t: { id: string; name: string; notes: string | null; created_at: string; updated_at: string; deleted_at: string | null },
): Promise<TemplateDoc> {
  const items = await store.all<ItemRow>('SELECT * FROM template_exercises WHERE template_id = ? ORDER BY position', [
    t.id,
  ]);
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

export interface SessionRow {
  id: string;
  template_id: string | null;
  name: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  updated_at: string;
  deleted_at: string | null;
}

export async function sessionDoc(store: Store, s: SessionRow): Promise<SessionDoc> {
  const items = await store.all<ItemRow>('SELECT * FROM session_exercises WHERE session_id = ? ORDER BY position', [
    s.id,
  ]);
  const sets = await store.all<{
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
    [s.id],
  );
  return {
    id: s.id,
    templateId: s.template_id,
    name: s.name,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    notes: s.notes,
    updatedAt: s.updated_at,
    deletedAt: s.deleted_at,
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
