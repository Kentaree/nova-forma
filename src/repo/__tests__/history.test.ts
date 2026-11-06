/** @jest-environment node */
import { initDatabase } from '@/db/init';
import type { Db } from '@/db/types';
import { CSV_HEADER, exerciseHistory, exportCsv, listSessions, previousBestScore } from '@/repo/history';
import { addExerciseToSession, finishSession, logSet, startSession } from '@/repo/sessions';
import { memoryDb } from '@/test/node-db';

let n = 0;
const uid = () => `h-${++n}`;
const v = (weightKg: number | null, reps: number | null) => ({ weightKg, reps, durationS: null, distanceM: null });

async function workout(db: Db, date: string, entries: [string, [number, number][]][], finish = true, name?: string) {
  const s = await startSession(db, uid(), { name }, new Date(date));
  for (const [exerciseId, sets] of entries) {
    const se = uid();
    await addExerciseToSession(db, s.id, exerciseId, se);
    for (const [w, r] of sets) await logSet(db, se, v(w, r), uid());
  }
  if (finish) await finishSession(db, s.id, new Date(Date.parse(date) + 3600_000));
  return s.id;
}

async function setup() {
  const db = memoryDb();
  await initDatabase(db);
  return db;
}

describe('history repo', () => {
  it('lists finished sessions newest first with a summary', async () => {
    const db = await setup();
    await workout(db, '2026-10-01T09:00:00Z', [['deadlift', [[100, 5]]]]);
    await workout(db, '2026-10-03T09:00:00Z', [
      ['barbell-bench-press', [[60, 10], [60, 8]]],
      ['pull-ups', [[0, 8]]],
    ]);
    await workout(db, '2026-10-05T09:00:00Z', [['deadlift', [[100, 5]]]], false); // in progress
    const list = await listSessions(db);
    expect(list.map((s) => s.startedAt)).toEqual(['2026-10-03T09:00:00.000Z', '2026-10-01T09:00:00.000Z']);
    expect(list[0]).toMatchObject({ exerciseNames: ['Barbell Bench Press', 'Pull-ups'], setCount: 3, volumeKg: 1080 });
  });

  it('returns per-exercise history and previous best', async () => {
    const db = await setup();
    await workout(db, '2026-10-01T09:00:00Z', [['deadlift', [[100, 5], [100, 5]]]]);
    await workout(db, '2026-10-08T09:00:00Z', [['deadlift', [[110, 3]]]]);
    const today = await workout(db, '2026-10-15T09:00:00Z', [['deadlift', [[150, 1]]]], false);

    const hist = await exerciseHistory(db, 'deadlift');
    expect(hist.map((h) => h.sets.length)).toEqual([1, 2]); // unfinished session excluded
    expect(await previousBestScore(db, 'deadlift', 'weight_reps', today)).toBeCloseTo(121, 0); // 110×3
    expect(await previousBestScore(db, 'plank', 'time', today)).toBeNull();
  });

  it('exports CSV with escaping', async () => {
    const db = await setup();
    await workout(db, '2026-10-01T09:00:00Z', [['deadlift', [[100, 5]]]], true, 'Pull, "heavy"');
    const csv = await exportCsv(db);
    const [header, row] = csv.trim().split('\n');
    expect(header).toBe(CSV_HEADER.join(','));
    expect(row).toBe('2026-10-01T09:00:00.000Z,"Pull, ""heavy""",Deadlift,1,working,100,5,,,');
  });
});
