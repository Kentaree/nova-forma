import type { Db } from './types';

/**
 * Schema migrations, applied in order and tracked with PRAGMA user_version.
 * Never edit a migration that has shipped; add a new one instead.
 *
 * Conventions:
 * - ids are UUID strings so rows can later sync to a backend without clashes.
 * - weights are always stored in kg; the display unit is a setting.
 * - timestamps are ISO-8601 UTC strings.
 * - superset_group: exercises in the same session/template sharing a non-null
 *   value are performed as a superset/circuit.
 */
export const migrations: string[] = [
  `
  CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    log_type TEXT NOT NULL CHECK (log_type IN ('weight_reps', 'reps', 'time', 'cardio')),
    primary_muscles TEXT NOT NULL DEFAULT '[]',
    secondary_muscles TEXT NOT NULL DEFAULT '[]',
    equipment TEXT NOT NULL DEFAULT '[]',
    instructions TEXT NOT NULL DEFAULT '[]',
    description TEXT,
    is_custom INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX exercises_name ON exercises (name COLLATE NOCASE);

  CREATE TABLE templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE template_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    template_id TEXT NOT NULL REFERENCES templates (id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises (id),
    position INTEGER NOT NULL,
    superset_group INTEGER,
    target_sets INTEGER,
    target_reps_min INTEGER,
    target_reps_max INTEGER,
    rest_seconds INTEGER
  );
  CREATE INDEX template_exercises_template ON template_exercises (template_id, position);

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL,
    template_id TEXT REFERENCES templates (id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    notes TEXT
  );
  CREATE INDEX sessions_started ON sessions (started_at);

  CREATE TABLE session_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises (id),
    position INTEGER NOT NULL,
    superset_group INTEGER,
    notes TEXT
  );
  CREATE INDEX session_exercises_session ON session_exercises (session_id, position);
  CREATE INDEX session_exercises_exercise ON session_exercises (exercise_id);

  CREATE TABLE sets (
    id TEXT PRIMARY KEY NOT NULL,
    session_exercise_id TEXT NOT NULL REFERENCES session_exercises (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    set_type TEXT NOT NULL DEFAULT 'working' CHECK (set_type IN ('warmup', 'working', 'failure')),
    weight_kg REAL,
    reps INTEGER,
    duration_s INTEGER,
    distance_m REAL,
    rpe REAL,
    completed_at TEXT NOT NULL
  );
  CREATE INDEX sets_session_exercise ON sets (session_exercise_id, position);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // 2: a workout started from a template remembers each exercise's targets.
  `
  ALTER TABLE session_exercises ADD COLUMN target_sets INTEGER;
  ALTER TABLE session_exercises ADD COLUMN target_reps_min INTEGER;
  ALTER TABLE session_exercises ADD COLUMN target_reps_max INTEGER;
  `,
];

export async function migrate(db: Db): Promise<void> {
  await db.exec('PRAGMA foreign_keys = ON;');
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < migrations.length) {
    const sql = migrations[version];
    const next = version + 1;
    await db.transaction(async () => {
      await db.exec(sql);
      await db.exec(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
