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
  // 3: sync. Triggers keep updated_at current and record what changed in sync_dirty,
  // so the repositories don't need to know about sync. While pulled changes are being
  // applied, sync_state.applying = 1 switches the triggers off.
  `
  ALTER TABLE sessions ADD COLUMN updated_at TEXT;
  UPDATE sessions SET updated_at = COALESCE(ended_at, started_at);

  CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    applying INTEGER NOT NULL DEFAULT 0,
    cursor INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT
  );
  INSERT INTO sync_state (id) VALUES (1);

  -- Documents changed since they were last pushed. rev increases on every change, so a
  -- push only clears the entry if nothing changed while it was in flight.
  CREATE TABLE sync_dirty (
    kind TEXT NOT NULL CHECK (kind IN ('exercise', 'template', 'session')),
    id TEXT NOT NULL,
    rev INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (kind, id)
  );

  -- Finished workouts deleted on this phone, kept until the deletion has been pushed.
  CREATE TABLE sync_tombstones (
    id TEXT PRIMARY KEY NOT NULL,
    template_id TEXT,
    name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    deleted_at TEXT NOT NULL
  );

  INSERT INTO sync_dirty (kind, id) SELECT 'exercise', id FROM exercises WHERE is_custom = 1;
  INSERT INTO sync_dirty (kind, id) SELECT 'template', id FROM templates;
  INSERT INTO sync_dirty (kind, id) SELECT 'session', id FROM sessions WHERE ended_at IS NOT NULL;

  -- Custom exercises
  CREATE TRIGGER sync_exercise_ins AFTER INSERT ON exercises
  WHEN NEW.is_custom = 1 AND (SELECT applying FROM sync_state) = 0 BEGIN
    INSERT INTO sync_dirty (kind, id) VALUES ('exercise', NEW.id) ON CONFLICT (kind, id) DO UPDATE SET rev = rev + 1;
  END;
  CREATE TRIGGER sync_exercise_upd AFTER UPDATE ON exercises
  WHEN NEW.is_custom = 1 AND (SELECT applying FROM sync_state) = 0 BEGIN
    INSERT INTO sync_dirty (kind, id) VALUES ('exercise', NEW.id) ON CONFLICT (kind, id) DO UPDATE SET rev = rev + 1;
  END;

  -- Templates: any change to a template or its exercises bumps updated_at and marks it dirty.
  CREATE TRIGGER sync_template_touch AFTER UPDATE OF name, notes, deleted_at ON templates
  WHEN NEW.updated_at IS OLD.updated_at AND (SELECT applying FROM sync_state) = 0 BEGIN
    UPDATE templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;
  CREATE TRIGGER sync_template_ins AFTER INSERT ON templates
  WHEN (SELECT applying FROM sync_state) = 0 BEGIN
    INSERT INTO sync_dirty (kind, id) VALUES ('template', NEW.id) ON CONFLICT (kind, id) DO UPDATE SET rev = rev + 1;
  END;
  CREATE TRIGGER sync_template_upd AFTER UPDATE ON templates
  WHEN (SELECT applying FROM sync_state) = 0 BEGIN
    INSERT INTO sync_dirty (kind, id) VALUES ('template', NEW.id) ON CONFLICT (kind, id) DO UPDATE SET rev = rev + 1;
  END;
  CREATE TRIGGER sync_template_item_ins AFTER INSERT ON template_exercises
  WHEN (SELECT applying FROM sync_state) = 0 BEGIN
    UPDATE templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.template_id;
  END;
  CREATE TRIGGER sync_template_item_upd AFTER UPDATE ON template_exercises
  WHEN (SELECT applying FROM sync_state) = 0 BEGIN
    UPDATE templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.template_id;
  END;
  CREATE TRIGGER sync_template_item_del AFTER DELETE ON template_exercises
  WHEN (SELECT applying FROM sync_state) = 0 BEGIN
    UPDATE templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.template_id;
  END;

  -- Sessions: only finished workouts sync. Changes to a session, its exercises or its
  -- sets bump updated_at; a finished one is marked dirty, and deleting one leaves a tombstone.
  CREATE TRIGGER sync_session_stamp AFTER INSERT ON sessions
  WHEN NEW.updated_at IS NULL BEGIN
    UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;
  CREATE TRIGGER sync_session_touch AFTER UPDATE OF template_id, name, started_at, ended_at, notes ON sessions
  WHEN NEW.updated_at IS OLD.updated_at AND (SELECT applying FROM sync_state) = 0 BEGIN
    UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;
  CREATE TRIGGER sync_session_upd AFTER UPDATE ON sessions
  WHEN NEW.ended_at IS NOT NULL AND (SELECT applying FROM sync_state) = 0 BEGIN
    INSERT INTO sync_dirty (kind, id) VALUES ('session', NEW.id) ON CONFLICT (kind, id) DO UPDATE SET rev = rev + 1;
  END;
  CREATE TRIGGER sync_session_del AFTER DELETE ON sessions
  WHEN OLD.ended_at IS NOT NULL AND (SELECT applying FROM sync_state) = 0 BEGIN
    INSERT OR REPLACE INTO sync_tombstones (id, template_id, name, started_at, deleted_at)
      VALUES (OLD.id, OLD.template_id, OLD.name, OLD.started_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    INSERT INTO sync_dirty (kind, id) VALUES ('session', OLD.id) ON CONFLICT (kind, id) DO UPDATE SET rev = rev + 1;
  END;
  CREATE TRIGGER sync_session_item_ins AFTER INSERT ON session_exercises
  WHEN (SELECT applying FROM sync_state) = 0 BEGIN
    UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.session_id;
  END;
  CREATE TRIGGER sync_session_item_upd AFTER UPDATE ON session_exercises
  WHEN (SELECT applying FROM sync_state) = 0 BEGIN
    UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.session_id;
  END;
  CREATE TRIGGER sync_session_item_del AFTER DELETE ON session_exercises
  WHEN (SELECT applying FROM sync_state) = 0 BEGIN
    UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.session_id;
  END;
  CREATE TRIGGER sync_set_ins AFTER INSERT ON sets
  WHEN (SELECT applying FROM sync_state) = 0 BEGIN
    UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = (SELECT session_id FROM session_exercises WHERE id = NEW.session_exercise_id);
  END;
  CREATE TRIGGER sync_set_upd AFTER UPDATE ON sets
  WHEN (SELECT applying FROM sync_state) = 0 BEGIN
    UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = (SELECT session_id FROM session_exercises WHERE id = NEW.session_exercise_id);
  END;
  CREATE TRIGGER sync_set_del AFTER DELETE ON sets
  WHEN (SELECT applying FROM sync_state) = 0 BEGIN
    UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = (SELECT session_id FROM session_exercises WHERE id = OLD.session_exercise_id);
  END;
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
