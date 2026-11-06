import library from '@/data/exercises.json';

import type { Db } from './types';

/** Bump when src/data/exercises.json changes so existing installs pick up the new library. */
export const LIBRARY_VERSION = 1;

type LibraryExercise = (typeof library.exercises)[number];

/**
 * Upserts the bundled exercise library. Custom exercises are never touched, and
 * built-in rows are updated in place so their ids (and the history that points at them) survive.
 */
export async function seedLibrary(db: Db, now = new Date().toISOString()): Promise<boolean> {
  const row = await db.first<{ value: string }>(`SELECT value FROM settings WHERE key = 'library_version'`);
  if (row && Number(row.value) >= LIBRARY_VERSION) return false;

  await db.transaction(async () => {
    for (const e of library.exercises as LibraryExercise[]) {
      await db.run(
        `INSERT INTO exercises (id, name, category, log_type, primary_muscles, secondary_muscles, equipment,
           instructions, description, is_custom, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name, category = excluded.category, log_type = excluded.log_type,
           primary_muscles = excluded.primary_muscles, secondary_muscles = excluded.secondary_muscles,
           equipment = excluded.equipment, instructions = excluded.instructions,
           description = excluded.description, updated_at = excluded.updated_at
         WHERE exercises.is_custom = 0`,
        [
          e.id,
          e.name,
          e.category,
          e.logType,
          JSON.stringify(e.primaryMuscles),
          JSON.stringify(e.secondaryMuscles),
          JSON.stringify(e.equipment),
          JSON.stringify(e.instructions),
          e.description ?? null,
          now,
          now,
        ],
      );
    }
    await db.run(
      `INSERT INTO settings (key, value) VALUES ('library_version', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [String(LIBRARY_VERSION)],
    );
  });
  return true;
}
