/** @jest-environment node */
import library from '@/data/exercises.json';
import { initDatabase } from '@/db/init';
import { migrations } from '@/db/migrations';
import { LIBRARY_VERSION, seedLibrary } from '@/db/seed';
import { memoryDb } from '@/test/node-db';

describe('initDatabase', () => {
  it('migrates to the latest version and seeds the library', async () => {
    const db = memoryDb();
    await initDatabase(db);
    expect((await db.first<{ user_version: number }>('PRAGMA user_version'))!.user_version).toBe(migrations.length);
    const { n } = (await db.first<{ n: number }>('SELECT count(*) n FROM exercises'))!;
    expect(n).toBe(library.exercises.length);
  });

  it('is idempotent', async () => {
    const db = memoryDb();
    await initDatabase(db);
    await initDatabase(db);
    const { n } = (await db.first<{ n: number }>('SELECT count(*) n FROM exercises'))!;
    expect(n).toBe(library.exercises.length);
  });

  it('re-seeding keeps custom exercises and existing ids', async () => {
    const db = memoryDb();
    await initDatabase(db);
    await db.run(
      `INSERT INTO exercises (id, name, category, log_type, is_custom, created_at, updated_at)
       VALUES ('mine', 'My Lift', 'strength', 'weight_reps', 1, 'x', 'x')`,
    );
    await db.run(`UPDATE settings SET value = '0' WHERE key = 'library_version'`);
    expect(await seedLibrary(db)).toBe(true);
    expect(await db.first(`SELECT id FROM exercises WHERE id = 'mine'`)).not.toBeNull();
    expect(await db.first(`SELECT id FROM exercises WHERE id = 'deadlift'`)).not.toBeNull();
    expect((await db.first<{ value: string }>(`SELECT value FROM settings WHERE key = 'library_version'`))!.value).toBe(
      String(LIBRARY_VERSION),
    );
  });
});

describe('bundled library', () => {
  it('has unique ids and names, and valid log types', () => {
    const ids = new Set(library.exercises.map((e) => e.id));
    const names = new Set(library.exercises.map((e) => e.name.toLowerCase()));
    expect(ids.size).toBe(library.exercises.length);
    expect(names.size).toBe(library.exercises.length);
    for (const e of library.exercises) {
      expect(['weight_reps', 'reps', 'time', 'cardio']).toContain(e.logType);
      expect(e.primaryMuscles.length).toBeGreaterThan(0);
    }
  });
});
