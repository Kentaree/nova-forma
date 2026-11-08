import library from '../../../src/data/exercises.json';
import { bestSet, prScore } from '../../../src/domain/records';
import { SYNC_PROTOCOL_VERSION, type LogType, type SetDoc, type TemplateDoc } from '../../../shared/sync-protocol';
import type { Store } from '../store';
import { applyChanges, sessionDoc, templateDoc, type SessionRow } from '../sync';

/**
 * What the MCP tools read and write. Everything here works on synced data: the built-in
 * exercise library (bundled, same ids as the app) plus whatever the app has pushed.
 */

export interface CatalogExercise {
  id: string;
  name: string;
  logType: LogType;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  custom: boolean;
}

export async function exerciseCatalog(store: Store): Promise<Map<string, CatalogExercise>> {
  const map = new Map<string, CatalogExercise>();
  for (const e of library.exercises) {
    map.set(e.id, {
      id: e.id,
      name: e.name,
      logType: e.logType as LogType,
      primaryMuscles: e.primaryMuscles,
      secondaryMuscles: e.secondaryMuscles,
      equipment: e.equipment,
      custom: false,
    });
  }
  const custom = await store.all<{
    id: string;
    name: string;
    log_type: LogType;
    primary_muscles: string;
    secondary_muscles: string;
    equipment: string;
  }>('SELECT * FROM exercises WHERE deleted_at IS NULL AND archived = 0');
  for (const e of custom) {
    map.set(e.id, {
      id: e.id,
      name: e.name,
      logType: e.log_type,
      primaryMuscles: JSON.parse(e.primary_muscles),
      secondaryMuscles: JSON.parse(e.secondary_muscles),
      equipment: JSON.parse(e.equipment),
      custom: true,
    });
  }
  return map;
}

export async function listExercises(store: Store, opts: { query?: string; muscle?: string; limit?: number }) {
  const q = opts.query?.trim().toLowerCase();
  const muscle = opts.muscle?.trim().toLowerCase();
  const all = [...(await exerciseCatalog(store)).values()];
  return all
    .filter((e) => !q || e.name.toLowerCase().includes(q) || e.id.includes(q))
    .filter((e) => !muscle || [...e.primaryMuscles, ...e.secondaryMuscles].some((m) => m.toLowerCase().includes(muscle)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, opts.limit ?? 50);
}

/** A set in as few tokens as possible: nulls dropped, weights in kg. */
function compactSet(s: SetDoc) {
  const out: Record<string, string | number> = {};
  if (s.setType !== 'working') out.type = s.setType;
  if (s.weightKg != null) out.kg = s.weightKg;
  if (s.reps != null) out.reps = s.reps;
  if (s.durationS != null) out.seconds = s.durationS;
  if (s.distanceM != null) out.metres = s.distanceM;
  if (s.rpe != null) out.rpe = s.rpe;
  return out;
}

const minutes = (a: string, b: string | null) => (b ? Math.round((Date.parse(b) - Date.parse(a)) / 60000) : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

export async function recentWorkouts(store: Store, opts: { days?: number; limit?: number }, now = new Date()) {
  const since = new Date(now.getTime() - (opts.days ?? 28) * 86_400_000).toISOString();
  const rows = await store.all<SessionRow>(
    `SELECT * FROM sessions WHERE deleted_at IS NULL AND started_at >= ? ORDER BY started_at DESC LIMIT ?`,
    [since, opts.limit ?? 20],
  );
  const catalog = await exerciseCatalog(store);
  const out = [];
  for (const row of rows) {
    const s = await sessionDoc(store, row);
    out.push({
      id: s.id,
      name: s.name,
      startedAt: s.startedAt,
      durationMinutes: minutes(s.startedAt, s.endedAt),
      notes: s.notes ?? undefined,
      exercises: s.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        name: catalog.get(e.exerciseId)?.name ?? e.exerciseId,
        supersetGroup: e.supersetGroup ?? undefined,
        sets: e.sets.map(compactSet),
      })),
    });
  }
  return out;
}

export async function exerciseProgress(store: Store, exerciseId: string, limit = 20) {
  const catalog = await exerciseCatalog(store);
  const exercise = catalog.get(exerciseId);
  if (!exercise) return null;
  const rows = await store.all<{ id: string; started_at: string }>(
    `SELECT se.id, s.started_at FROM session_exercises se JOIN sessions s ON s.id = se.session_id
     WHERE se.exercise_id = ? AND s.deleted_at IS NULL ORDER BY s.started_at DESC LIMIT ?`,
    [exerciseId, limit],
  );
  let allTimeBest: { date: string; set: Record<string, string | number>; estimated1RmKg?: number } | null = null;
  let allTimeScore = -Infinity;
  const sessions = [];
  for (const r of rows) {
    const sets = await store.all<{
      id: string;
      position: number;
      set_type: SetDoc['setType'];
      weight_kg: number | null;
      reps: number | null;
      duration_s: number | null;
      distance_m: number | null;
      rpe: number | null;
      completed_at: string;
    }>('SELECT * FROM sets WHERE session_exercise_id = ? ORDER BY position', [r.id]);
    const docs: SetDoc[] = sets.map((x) => ({
      id: x.id,
      position: x.position,
      setType: x.set_type,
      weightKg: x.weight_kg,
      reps: x.reps,
      durationS: x.duration_s,
      distanceM: x.distance_m,
      rpe: x.rpe,
      completedAt: x.completed_at,
    }));
    const best = bestSet(exercise.logType, docs);
    const score = best ? prScore(exercise.logType, best) : null;
    const e1rm = exercise.logType === 'weight_reps' && score != null ? round1(score) : undefined;
    if (best && score != null && score > allTimeScore) {
      allTimeScore = score;
      allTimeBest = { date: r.started_at, set: compactSet(best), estimated1RmKg: e1rm };
    }
    sessions.push({ date: r.started_at, sets: docs.map(compactSet), estimated1RmKg: e1rm });
  }
  return { exercise: { id: exercise.id, name: exercise.name, logType: exercise.logType }, bestInPeriod: allTimeBest, sessions };
}

export async function listTemplates(store: Store) {
  const catalog = await exerciseCatalog(store);
  const rows = await store.all<{
    id: string;
    name: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }>('SELECT * FROM templates WHERE deleted_at IS NULL ORDER BY name');
  const out = [];
  for (const row of rows) {
    const t = await templateDoc(store, row);
    out.push({
      id: t.id,
      name: t.name,
      notes: t.notes ?? undefined,
      updatedAt: t.updatedAt,
      exercises: t.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        name: catalog.get(e.exerciseId)?.name ?? e.exerciseId,
        sets: e.targetSets ?? undefined,
        repsMin: e.targetRepsMin ?? undefined,
        repsMax: e.targetRepsMax ?? undefined,
        supersetGroup: e.supersetGroup ?? undefined,
      })),
    });
  }
  return out;
}

export interface TemplateInput {
  id?: string;
  name: string;
  notes?: string;
  exercises: { exerciseId: string; sets: number; repsMin: number; repsMax: number; supersetGroup?: number }[];
}

export class ToolError extends Error {}

/** Creates a template, or replaces one when `id` names an existing template. The app pulls it on its next sync. */
export async function saveTemplate(store: Store, input: TemplateInput, now = new Date()): Promise<TemplateDoc> {
  const catalog = await exerciseCatalog(store);
  const unknown = input.exercises.filter((e) => !catalog.has(e.exerciseId)).map((e) => e.exerciseId);
  if (unknown.length) {
    throw new ToolError(`Unknown exercise id(s): ${unknown.join(', ')}. Use list_exercises to find valid ids.`);
  }
  const existing = input.id
    ? await store.first<{ created_at: string; deleted_at: string | null }>('SELECT created_at, deleted_at FROM templates WHERE id = ?', [
        input.id,
      ])
    : null;
  if (input.id && (!existing || existing.deleted_at)) throw new ToolError(`No template with id ${input.id}.`);

  const stamp = now.toISOString();
  const doc: TemplateDoc = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name.trim(),
    notes: input.notes?.trim() || null,
    createdAt: existing?.created_at ?? stamp,
    updatedAt: stamp,
    deletedAt: null,
    exercises: input.exercises.map((e, position) => ({
      id: crypto.randomUUID(),
      exerciseId: e.exerciseId,
      position,
      supersetGroup: e.supersetGroup ?? null,
      targetSets: e.sets,
      targetRepsMin: Math.min(e.repsMin, e.repsMax),
      targetRepsMax: Math.max(e.repsMin, e.repsMax),
    })),
  };
  await applyChanges(store, { protocol: SYNC_PROTOCOL_VERSION, cursor: 0, exercises: [], templates: [doc], sessions: [] });
  return doc;
}

export async function deleteTemplate(store: Store, id: string, now = new Date()): Promise<void> {
  const row = await store.first<{
    id: string;
    name: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }>('SELECT * FROM templates WHERE id = ?', [id]);
  if (!row || row.deleted_at) throw new ToolError(`No template with id ${id}.`);
  const stamp = now.toISOString();
  await applyChanges(store, {
    protocol: SYNC_PROTOCOL_VERSION,
    cursor: 0,
    exercises: [],
    sessions: [],
    templates: [{ id, name: row.name, notes: row.notes, createdAt: row.created_at, updatedAt: stamp, deletedAt: stamp, exercises: [] }],
  });
}
