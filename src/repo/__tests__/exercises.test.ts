/** @jest-environment node */
import { initDatabase } from '@/db/init';
import { createCustomExercise, getExercise, listExercises, listMuscles } from '@/repo/exercises';
import { getSettings, saveSettings } from '@/repo/settings';
import { memoryDb } from '@/test/node-db';

async function setup() {
  const db = memoryDb();
  await initDatabase(db);
  return db;
}

describe('exercises repo', () => {
  it('searches by name, case-insensitively', async () => {
    const db = await setup();
    const names = (await listExercises(db, { search: 'bench' })).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['Barbell Bench Press', 'Dumbbell Bench Press']));
    expect(names.every((n) => n.toLowerCase().includes('bench'))).toBe(true);
  });

  it('treats LIKE wildcards in the search literally', async () => {
    const db = await setup();
    expect(await listExercises(db, { search: '%' })).toEqual([]);
  });

  it('filters by primary muscle', async () => {
    const db = await setup();
    const list = await listExercises(db, { muscle: 'hamstrings' });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e) => e.primaryMuscles.includes('hamstrings'))).toBe(true);
    expect(await listMuscles(db)).toContain('hamstrings');
  });

  it('maps rows to typed exercises', async () => {
    const db = await setup();
    const dl = await getExercise(db, 'deadlift');
    expect(dl).toMatchObject({ name: 'Deadlift', logType: 'weight_reps', isCustom: false });
    expect(Array.isArray(dl!.instructions)).toBe(true);
  });

  it('creates custom exercises and rejects duplicate names', async () => {
    const db = await setup();
    const ex = await createCustomExercise(db, { name: ' Belt Squat ', logType: 'weight_reps', primaryMuscles: ['quadriceps'] }, 'c1');
    expect(ex).toMatchObject({ id: 'c1', name: 'Belt Squat', isCustom: true });
    await expect(
      createCustomExercise(db, { name: 'deadlift', logType: 'weight_reps', primaryMuscles: [] }, 'c2'),
    ).rejects.toThrow(/already exists/);
    await expect(createCustomExercise(db, { name: '  ', logType: 'reps', primaryMuscles: [] }, 'c3')).rejects.toThrow(
      /required/,
    );
  });
});

describe('settings repo', () => {
  it('defaults and saves', async () => {
    const db = await setup();
    expect(await getSettings(db)).toEqual({ weightUnit: 'kg', defaultRestSeconds: 120 });
    await saveSettings(db, { weightUnit: 'lb', defaultRestSeconds: 90 });
    expect(await getSettings(db)).toEqual({ weightUnit: 'lb', defaultRestSeconds: 90 });
  });
});
