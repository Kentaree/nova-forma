/** @jest-environment node */
import { initDatabase } from '@/db/init';
import type { Db } from '@/db/types';
import {
  addExerciseToSession,
  defaultSessionName,
  deleteSet,
  discardSession,
  finishSession,
  getActiveSession,
  getSessionDetail,
  lastPerformance,
  logSet,
  moveSessionExercise,
  removeSessionExercise,
  startSession,
  toggleSupersetWithNext,
  updateSet,
} from '@/repo/sessions';
import { memoryDb } from '@/test/node-db';

const v = (weightKg: number | null, reps: number | null) => ({ weightKg, reps, durationS: null, distanceM: null });

let n = 0;
const uid = () => `id-${++n}`;

async function setup() {
  const db = memoryDb();
  await initDatabase(db);
  return db;
}

async function sessionWith(db: Db, exerciseIds: string[], at = new Date('2026-11-01T09:00:00Z')) {
  const s = await startSession(db, uid(), {}, at);
  const seIds: string[] = [];
  for (const e of exerciseIds) {
    const id = uid();
    await addExerciseToSession(db, s.id, e, id);
    seIds.push(id);
  }
  return { sessionId: s.id, seIds };
}

describe('sessions repo', () => {
  it('starts a session that shows as active until finished', async () => {
    const db = await setup();
    const { sessionId, seIds } = await sessionWith(db, ['deadlift']);
    expect((await getActiveSession(db))?.id).toBe(sessionId);
    await logSet(db, seIds[0], v(100, 5), uid());
    expect(await finishSession(db, sessionId)).toBe(true);
    expect(await getActiveSession(db)).toBeNull();
  });

  it('names sessions by time of day', () => {
    expect(defaultSessionName(new Date(2026, 0, 1, 7))).toBe('Morning workout');
    expect(defaultSessionName(new Date(2026, 0, 1, 18))).toBe('Evening workout');
  });

  it('logs, edits and deletes sets, keeping positions contiguous', async () => {
    const db = await setup();
    const { sessionId, seIds } = await sessionWith(db, ['deadlift']);
    const a = await logSet(db, seIds[0], { ...v(60, 5), setType: 'warmup' }, uid());
    const b = await logSet(db, seIds[0], v(100, 5), uid());
    await logSet(db, seIds[0], v(100, 4), uid());
    expect(a).toMatchObject({ position: 0, setType: 'warmup', weightKg: 60 });

    await updateSet(db, b.id, { reps: 6, setType: 'failure' });
    await deleteSet(db, a.id);
    const sets = (await getSessionDetail(db, sessionId))!.exercises[0].sets;
    expect(sets.map((s) => [s.position, s.reps, s.setType])).toEqual([
      [0, 6, 'failure'],
      [1, 4, 'working'],
    ]);
  });

  it('reorders and removes exercises', async () => {
    const db = await setup();
    const { sessionId, seIds } = await sessionWith(db, ['deadlift', 'pull-ups', 'plank']);
    await moveSessionExercise(db, seIds[2], -1);
    await moveSessionExercise(db, seIds[0], -1); // already first: no-op
    let names = (await getSessionDetail(db, sessionId))!.exercises.map((e) => e.exercise.id);
    expect(names).toEqual(['deadlift', 'plank', 'pull-ups']);
    await removeSessionExercise(db, seIds[2]);
    const detail = (await getSessionDetail(db, sessionId))!;
    names = detail.exercises.map((e) => e.exercise.id);
    expect(names).toEqual(['deadlift', 'pull-ups']);
    expect(detail.exercises.map((e) => e.position)).toEqual([0, 1]);
  });

  it('links and unlinks supersets', async () => {
    const db = await setup();
    const { sessionId, seIds } = await sessionWith(db, ['deadlift', 'pull-ups', 'plank', 'push-ups']);
    const groups = async () => (await getSessionDetail(db, sessionId))!.exercises.map((e) => e.supersetGroup);

    await toggleSupersetWithNext(db, seIds[0]);
    await toggleSupersetWithNext(db, seIds[1]);
    const g = await groups();
    expect(g[0]).not.toBeNull();
    expect(g.slice(0, 3)).toEqual([g[0], g[0], g[0]]);
    expect(g[3]).toBeNull();

    // Splitting after the first leaves a 2-exercise superset and a lone (ungrouped) exercise.
    await toggleSupersetWithNext(db, seIds[1]);
    const g2 = await groups();
    expect(g2[0]).toBe(g2[1]);
    expect(g2[2]).toBeNull();

    // Removing one of a pair dissolves the pair.
    await removeSessionExercise(db, seIds[1]);
    expect(await groups()).toEqual([null, null, null]);
  });

  it('finishing drops empty exercises, and deletes a session with nothing logged', async () => {
    const db = await setup();
    const { sessionId, seIds } = await sessionWith(db, ['deadlift', 'plank']);
    await logSet(db, seIds[0], v(100, 5), uid());
    await finishSession(db, sessionId);
    expect((await getSessionDetail(db, sessionId))!.exercises.map((e) => e.exercise.id)).toEqual(['deadlift']);

    const empty = await sessionWith(db, ['plank']);
    expect(await finishSession(db, empty.sessionId)).toBe(false);
    expect(await getSessionDetail(db, empty.sessionId)).toBeNull();
  });

  it('discards a session and its sets', async () => {
    const db = await setup();
    const { sessionId, seIds } = await sessionWith(db, ['deadlift']);
    await logSet(db, seIds[0], v(100, 5), uid());
    await discardSession(db, sessionId);
    expect(await getSessionDetail(db, sessionId)).toBeNull();
    expect((await db.first<{ n: number }>('SELECT COUNT(*) n FROM sets'))!.n).toBe(0);
  });

  it('finds last performance from the most recent other session', async () => {
    const db = await setup();
    const older = await sessionWith(db, ['deadlift'], new Date('2026-10-01T09:00:00Z'));
    await logSet(db, older.seIds[0], v(90, 5), uid());
    const newer = await sessionWith(db, ['deadlift'], new Date('2026-10-08T09:00:00Z'));
    await logSet(db, newer.seIds[0], v(95, 5), uid());
    await logSet(db, newer.seIds[0], v(95, 4), uid());
    const emptyer = await sessionWith(db, ['deadlift'], new Date('2026-10-10T09:00:00Z')); // added but never logged
    const today = await sessionWith(db, ['deadlift'], new Date('2026-10-15T09:00:00Z'));
    await logSet(db, today.seIds[0], v(100, 5), uid());

    const last = await lastPerformance(db, 'deadlift', today.sessionId);
    expect(last?.date).toBe('2026-10-08T09:00:00.000Z');
    expect(last?.sets.map((s) => s.reps)).toEqual([5, 4]);
    expect(emptyer).toBeDefined();
    expect(await lastPerformance(db, 'plank', today.sessionId)).toBeNull();
  });
});
