-- Nova Forma sync server schema (Cloudflare D1 / SQLite).
-- Mirrors the app's tables, plus `updated_at` / `deleted_at` for last-write-wins
-- and tombstones, and `seq` so clients can pull "everything changed since N".

CREATE TABLE meta (
  key TEXT PRIMARY KEY NOT NULL,
  value INTEGER NOT NULL
);
INSERT INTO meta (key, value) VALUES ('seq', 0);

CREATE TABLE exercises (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  log_type TEXT NOT NULL,
  primary_muscles TEXT NOT NULL DEFAULT '[]',
  secondary_muscles TEXT NOT NULL DEFAULT '[]',
  equipment TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  seq INTEGER NOT NULL
);
CREATE INDEX exercises_seq ON exercises (seq);

CREATE TABLE templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  seq INTEGER NOT NULL
);
CREATE INDEX templates_seq ON templates (seq);

CREATE TABLE template_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  template_id TEXT NOT NULL REFERENCES templates (id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  superset_group INTEGER,
  target_sets INTEGER,
  target_reps_min INTEGER,
  target_reps_max INTEGER
);
CREATE INDEX template_exercises_template ON template_exercises (template_id, position);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  template_id TEXT,
  name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  seq INTEGER NOT NULL
);
CREATE INDEX sessions_seq ON sessions (seq);
CREATE INDEX sessions_started ON sessions (started_at);

CREATE TABLE session_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  superset_group INTEGER,
  target_sets INTEGER,
  target_reps_min INTEGER,
  target_reps_max INTEGER
);
CREATE INDEX session_exercises_session ON session_exercises (session_id, position);
CREATE INDEX session_exercises_exercise ON session_exercises (exercise_id);

CREATE TABLE sets (
  id TEXT PRIMARY KEY NOT NULL,
  session_exercise_id TEXT NOT NULL REFERENCES session_exercises (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  set_type TEXT NOT NULL,
  weight_kg REAL,
  reps INTEGER,
  duration_s INTEGER,
  distance_m REAL,
  rpe REAL,
  completed_at TEXT NOT NULL
);
CREATE INDEX sets_session_exercise ON sets (session_exercise_id, position);
