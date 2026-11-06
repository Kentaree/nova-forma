import type { Db } from '@/db/types';
import { bestSet, prScore, volumeKg } from '@/domain/records';
import type { LoggedSet, LogType, SetType } from '@/domain/types';

export interface SessionSummary {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string;
  exerciseNames: string[];
  setCount: number;
  volumeKg: number;
}

interface SetJoinRow {
  session_id: string;
  session_name: string;
  started_at: string;
  ended_at: string | null;
  exercise_id: string;
  exercise_name: string;
  log_type: LogType;
  se_position: number;
  id: string;
  position: number;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  rpe: number | null;
  completed_at: string;
}

const SET_JOIN = `
  SELECT s.id AS session_id, s.name AS session_name, s.started_at, s.ended_at,
         e.id AS exercise_id, e.name AS exercise_name, e.log_type, se.position AS se_position,
         st.id, st.position, st.set_type, st.weight_kg, st.reps, st.duration_s, st.distance_m, st.rpe, st.completed_at
  FROM sets st
  JOIN session_exercises se ON se.id = st.session_exercise_id
  JOIN sessions s ON s.id = se.session_id
  JOIN exercises e ON e.id = se.exercise_id`;

const toSet = (r: SetJoinRow): LoggedSet => ({
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

/** Finished sessions, newest first. */
export async function listSessions(db: Db, limit = 100): Promise<SessionSummary[]> {
  const sessions = await db.all<{ id: string; name: string; started_at: string; ended_at: string }>(
    `SELECT id, name, started_at, ended_at FROM sessions WHERE ended_at IS NOT NULL
     ORDER BY started_at DESC LIMIT ?`,
    [limit],
  );
  if (!sessions.length) return [];
  const ids = sessions.map((s) => s.id);
  const rows = await db.all<SetJoinRow>(
    `${SET_JOIN} WHERE s.id IN (${ids.map(() => '?').join(',')}) ORDER BY se.position, st.position`,
    ids,
  );
  return sessions.map((s) => {
    const mine = rows.filter((r) => r.session_id === s.id);
    const names: string[] = [];
    for (const r of mine) if (!names.includes(r.exercise_name)) names.push(r.exercise_name);
    return {
      id: s.id,
      name: s.name,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      exerciseNames: names,
      setCount: mine.length,
      volumeKg: volumeKg(mine.filter((r) => r.log_type === 'weight_reps').map(toSet)),
    };
  });
}

export interface ExerciseSessionLog {
  sessionId: string;
  sessionName: string;
  date: string;
  sets: LoggedSet[];
}

/** Every finished session that included this exercise, newest first, with its sets. */
export async function exerciseHistory(db: Db, exerciseId: string): Promise<ExerciseSessionLog[]> {
  const rows = await db.all<SetJoinRow>(
    `${SET_JOIN} WHERE e.id = ? AND s.ended_at IS NOT NULL ORDER BY s.started_at DESC, se.position, st.position`,
    [exerciseId],
  );
  const out: ExerciseSessionLog[] = [];
  for (const r of rows) {
    let log = out.at(-1);
    if (!log || log.sessionId !== r.session_id) {
      log = { sessionId: r.session_id, sessionName: r.session_name, date: r.started_at, sets: [] };
      out.push(log);
    }
    log.sets.push(toSet(r));
  }
  return out;
}

/**
 * The best score (see prScore) for an exercise across all sessions other than
 * `excludeSessionId`, or null if it has never been logged there.
 */
export async function previousBestScore(
  db: Db,
  exerciseId: string,
  logType: LogType,
  excludeSessionId: string,
): Promise<number | null> {
  const rows = await db.all<SetJoinRow>(`${SET_JOIN} WHERE e.id = ? AND s.id != ?`, [exerciseId, excludeSessionId]);
  const best = bestSet(logType, rows.map(toSet));
  return best ? prScore(logType, best) : null;
}

function csvCell(v: string | number | null): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER = [
  'date',
  'workout',
  'exercise',
  'set',
  'set_type',
  'weight_kg',
  'reps',
  'duration_s',
  'distance_m',
  'rpe',
];

/** All finished workouts as CSV, oldest first: one row per set. Weights are in kg. */
export async function exportCsv(db: Db): Promise<string> {
  const rows = await db.all<SetJoinRow>(
    `${SET_JOIN} WHERE s.ended_at IS NOT NULL ORDER BY s.started_at, se.position, st.position`,
  );
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    lines.push(
      [r.started_at, r.session_name, r.exercise_name, r.position + 1, r.set_type, r.weight_kg, r.reps, r.duration_s, r.distance_m, r.rpe]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}
