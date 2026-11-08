/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { initDatabase } from '@/db/init';
import type { Db } from '@/db/types';
import { createCustomExercise, getExercise } from '@/repo/exercises';
import { listSessions } from '@/repo/history';
import {
  addExerciseToSession,
  discardSession,
  finishSession,
  getSessionDetail,
  logSet,
  startSession,
  updateSet,
} from '@/repo/sessions';
import { addExerciseToTemplate, createTemplate, deleteTemplate, getTemplate, listTemplates, renameTemplate } from '@/repo/templates';
import { memoryDb } from '@/test/node-db';

import { applyChanges, changesSince } from '../../../server/src/sync';
import type { Statement, Store } from '../../../server/src/store';
import { getSyncState, runSync, startFresh, type SyncTransport } from '../engine';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');

/** The real server sync logic, running on in-memory SQLite. */
function fakeServer(): { transport: SyncTransport; requests: number } {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/0001_init.sql'), 'utf8'));
  const store: Store = {
    all: async (sql, params = []) => db.prepare(sql).all(...params),
    first: async (sql, params = []) => db.prepare(sql).get(...params) ?? null,
    batch: async (statements: Statement[]) => {
      db.exec('BEGIN');
      for (const s of statements) db.prepare(s.sql).run(...s.params);
      db.exec('COMMIT');
    },
  };
  const server = {
    requests: 0,
    transport: async (req: Parameters<SyncTransport>[0]) => {
      server.requests++;
      // Round-trip through JSON like the network would.
      const body = JSON.parse(JSON.stringify(req));
      await applyChanges(store, body);
      return JSON.parse(JSON.stringify(await changesSince(store, body.cursor)));
    },
  };
  return server;
}

let n = 0;
const uid = () => `id-${++n}`;
const v = (weightKg: number, reps: number) => ({ weightKg, reps, durationS: null, distanceM: null });

async function device(): Promise<Db> {
  const db = memoryDb();
  await initDatabase(db);
  return db;
}

async function workout(db: Db, at = new Date('2026-11-01T10:00:00Z')) {
  const s = await startSession(db, uid(), {}, at);
  const se = uid();
  await addExerciseToSession(db, s.id, 'barbell-bench-press', se);
  const set = await logSet(db, se, v(100, 5), uid(), at);
  await finishSession(db, s.id, new Date(at.getTime() + 3600_000));
  return { sessionId: s.id, setId: set.id };
}

describe('sync engine', () => {
  it('copies workouts, templates and custom exercises to a second phone', async () => {
    const server = fakeServer();
    const a = await device();
    const b = await device();

    const ex = await createCustomExercise(a, { name: 'Belt squat', logType: 'weight_reps', primaryMuscles: ['quads'] }, uid());
    await createTemplate(a, 'tpl', 'Legs');
    await addExerciseToTemplate(a, 'tpl', ex.id, uid());
    const { sessionId } = await workout(a);

    expect(await getSyncState(a)).toMatchObject({ pending: 3, lastSyncedAt: null });
    expect(await runSync(a, server.transport)).toEqual({ pushed: 3, pulled: 0 });
    expect(await getSyncState(a)).toMatchObject({ pending: 0 });

    expect(await runSync(b, server.transport)).toEqual({ pushed: 0, pulled: 3 });
    expect((await getExercise(b, ex.id))?.name).toBe('Belt squat');
    expect((await getTemplate(b, 'tpl'))?.exercises.map((e) => e.exercise.id)).toEqual([ex.id]);
    const detail = await getSessionDetail(b, sessionId);
    expect(detail?.exercises[0].sets[0]).toMatchObject({ weightKg: 100, reps: 5 });

    // Pulled data isn't pushed back.
    expect(await getSyncState(b)).toMatchObject({ pending: 0 });
    expect(await runSync(b, server.transport)).toEqual({ pushed: 0, pulled: 0 });
  });

  it('does not sync a workout that is still in progress', async () => {
    const server = fakeServer();
    const a = await device();
    const s = await startSession(a, uid());
    const se = uid();
    await addExerciseToSession(a, s.id, 'barbell-bench-press', se);
    await logSet(a, se, v(60, 10), uid());
    expect(await runSync(a, server.transport)).toEqual({ pushed: 0, pulled: 0 });

    await finishSession(a, s.id);
    expect(await runSync(a, server.transport)).toEqual({ pushed: 1, pulled: 0 });
  });

  it('syncs edits to a finished workout', async () => {
    const server = fakeServer();
    const a = await device();
    const b = await device();
    const { sessionId, setId } = await workout(a);
    await runSync(a, server.transport);
    await runSync(b, server.transport);

    await updateSet(a, setId, { reps: 6 });
    expect(await getSyncState(a)).toMatchObject({ pending: 1 });
    await runSync(a, server.transport);
    await runSync(b, server.transport);
    expect((await getSessionDetail(b, sessionId))?.exercises[0].sets[0].reps).toBe(6);
  });

  it('syncs deletions of workouts and templates', async () => {
    const server = fakeServer();
    const a = await device();
    const b = await device();
    const { sessionId } = await workout(a);
    await createTemplate(a, 'tpl', 'Push');
    await runSync(a, server.transport);
    await runSync(b, server.transport);
    expect(await listSessions(b)).toHaveLength(1);

    await discardSession(a, sessionId);
    await deleteTemplate(a, 'tpl');
    await runSync(a, server.transport);
    await runSync(b, server.transport);
    expect(await listSessions(b)).toHaveLength(0);
    expect(await listTemplates(b)).toHaveLength(0);
  });

  it('keeps the newest edit when both phones change the same template', async () => {
    const server = fakeServer();
    const a = await device();
    const b = await device();
    await createTemplate(a, 'tpl', 'Push', '2026-11-01T00:00:00.000Z');
    await runSync(a, server.transport);
    await runSync(b, server.transport);

    await renameTemplate(a, 'tpl', 'Push (A)', '2026-11-02T00:00:00.000Z');
    await renameTemplate(b, 'tpl', 'Push (B)', '2026-11-03T00:00:00.000Z');
    await runSync(a, server.transport);
    await runSync(b, server.transport); // B is newer: wins on the server
    await runSync(a, server.transport); // and reaches A
    expect((await getTemplate(a, 'tpl'))?.name).toBe('Push (B)');
    expect((await getTemplate(b, 'tpl'))?.name).toBe('Push (B)');
  });

  it('keeps local changes when the server is unreachable', async () => {
    const a = await device();
    await workout(a);
    await expect(runSync(a, () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
    expect(await getSyncState(a)).toMatchObject({ pending: 1, lastSyncedAt: null });
  });

  it('keeps a change made while a sync was in flight', async () => {
    const server = fakeServer();
    const a = await device();
    await createTemplate(a, 'tpl', 'Push', '2026-11-01T00:00:00.000Z');
    await runSync(a, async (req) => {
      await renameTemplate(a, 'tpl', 'Push 2', '2026-11-02T00:00:00.000Z'); // user edits mid-request
      return server.transport(req);
    });
    expect((await getTemplate(a, 'tpl'))?.name).toBe('Push 2');
    expect(await getSyncState(a)).toMatchObject({ pending: 1 });
  });

  it('fills in an exercise this phone does not know', async () => {
    const server = fakeServer();
    const b = await device();
    await server.transport({
      protocol: 1,
      cursor: 0,
      exercises: [],
      sessions: [],
      templates: [
        {
          id: 'tpl-x',
          name: 'From Claude',
          notes: null,
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
          deletedAt: null,
          exercises: [
            { id: 'i', exerciseId: 'nope', position: 0, supersetGroup: null, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 },
          ],
        },
      ],
    });
    await runSync(b, server.transport);
    expect((await getTemplate(b, 'tpl-x'))?.exercises[0].exercise.id).toBe("nope");
    expect((await getExercise(b, 'nope'))?.name).toBe('Unknown exercise');
  });

  it('uploads everything again when connecting to a new server', async () => {
    const a = await device();
    await workout(a);
    await createTemplate(a, 'tpl', 'Push');
    await runSync(a, fakeServer().transport);
    expect(await getSyncState(a)).toMatchObject({ pending: 0 });

    await startFresh(a);
    const fresh = fakeServer();
    expect(await runSync(a, fresh.transport)).toEqual({ pushed: 2, pulled: 0 });
  });
});
