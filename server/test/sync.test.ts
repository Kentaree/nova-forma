import { beforeEach, describe, expect, it } from 'vitest';

import {
  SYNC_PROTOCOL_VERSION,
  type ExerciseDoc,
  type SessionDoc,
  type SyncRequest,
  type SyncResponse,
  type TemplateDoc,
} from '../../shared/sync-protocol';
import { createApp } from '../src/app';
import { sqliteStore } from './sqlite-store';

const TOKEN = 'test-token';
const T1 = '2026-11-01T10:00:00.000Z';
const T2 = '2026-11-02T10:00:00.000Z';
const T3 = '2026-11-03T10:00:00.000Z';

const exercise = (over: Partial<ExerciseDoc> = {}): ExerciseDoc => ({
  id: 'ex-1',
  name: 'Landmine press',
  category: 'strength',
  logType: 'weight_reps',
  primaryMuscles: ['shoulders'],
  secondaryMuscles: ['triceps'],
  equipment: ['barbell'],
  instructions: ['Press up and forward'],
  description: null,
  archived: false,
  updatedAt: T1,
  deletedAt: null,
  ...over,
});

const template = (over: Partial<TemplateDoc> = {}): TemplateDoc => ({
  id: 'tpl-1',
  name: 'Push A',
  notes: null,
  createdAt: T1,
  updatedAt: T1,
  deletedAt: null,
  exercises: [
    { id: 'te-1', exerciseId: 'bench', position: 0, supersetGroup: null, targetSets: 3, targetRepsMin: 5, targetRepsMax: 8 },
    { id: 'te-2', exerciseId: 'ex-1', position: 1, supersetGroup: 1, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 },
  ],
  ...over,
});

const session = (over: Partial<SessionDoc> = {}): SessionDoc => ({
  id: 'ses-1',
  templateId: 'tpl-1',
  name: 'Push A',
  startedAt: T1,
  endedAt: T2,
  notes: null,
  updatedAt: T2,
  deletedAt: null,
  exercises: [
    {
      id: 'se-1',
      exerciseId: 'bench',
      position: 0,
      supersetGroup: null,
      targetSets: 3,
      targetRepsMin: 5,
      targetRepsMax: 8,
      sets: [
        { id: 's-1', position: 0, setType: 'warmup', weightKg: 60, reps: 8, durationS: null, distanceM: null, rpe: null, completedAt: T1 },
        { id: 's-2', position: 1, setType: 'working', weightKg: 100, reps: 5, durationS: null, distanceM: null, rpe: 8.5, completedAt: T1 },
      ],
    },
  ],
  ...over,
});

const req = (over: Partial<SyncRequest> = {}): SyncRequest => ({
  protocol: SYNC_PROTOCOL_VERSION,
  cursor: 0,
  exercises: [],
  templates: [],
  sessions: [],
  ...over,
});

let store: ReturnType<typeof sqliteStore>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = sqliteStore();
  app = createApp(() => store);
});

async function sync(body: unknown, token = TOKEN) {
  return app.request(
    '/v1/sync',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    { SYNC_TOKEN: TOKEN },
  );
}

async function ok(body: SyncRequest): Promise<SyncResponse> {
  const res = await sync(body);
  expect(res.status).toBe(200);
  return res.json();
}

describe('auth', () => {
  it('serves /health without a token', async () => {
    const res = await app.request('/health', {}, { SYNC_TOKEN: TOKEN });
    expect(res.status).toBe(200);
  });

  it('rejects a missing or wrong token', async () => {
    expect((await sync(req(), 'nope')).status).toBe(401);
    const res = await app.request('/v1/sync', { method: 'POST', body: '{}' }, { SYNC_TOKEN: TOKEN });
    expect(res.status).toBe(401);
  });

  it('fails closed when the secret is not configured', async () => {
    const res = await app.request('/v1/sync', { method: 'POST', headers: { authorization: 'Bearer x' } }, {});
    expect(res.status).toBe(500);
  });
});

describe('validation', () => {
  it('rejects bad JSON and bad shapes', async () => {
    expect((await sync('{not json')).status).toBe(400);
    expect((await sync({ ...req(), protocol: 99 })).status).toBe(400);
    expect((await sync({ ...req(), sessions: [{ id: 'x' }] })).status).toBe(400);
  });
});

describe('sync', () => {
  it('round-trips every document type to another device', async () => {
    const first = await ok(req({ exercises: [exercise()], templates: [template()], sessions: [session()] }));
    expect(first.cursor).toBe(3);

    const other = await ok(req());
    expect(other.exercises).toEqual([exercise()]);
    expect(other.templates).toEqual([template()]);
    expect(other.sessions).toEqual([session()]);
  });

  it('only returns changes after the cursor', async () => {
    const a = await ok(req({ exercises: [exercise()] }));
    await ok(req({ cursor: a.cursor, templates: [template()] }));
    const b = await ok(req({ cursor: a.cursor }));
    expect(b.exercises).toEqual([]);
    expect(b.templates.map((t) => t.id)).toEqual(['tpl-1']);
    expect(b.cursor).toBe(2);
    expect(await ok(req({ cursor: b.cursor }))).toEqual({ cursor: 2, exercises: [], templates: [], sessions: [] });
  });

  it('keeps the newer copy (last write wins)', async () => {
    await ok(req({ templates: [template({ name: 'Newer', updatedAt: T3 })] }));
    const res = await ok(req({ templates: [template({ name: 'Older', updatedAt: T2 })] }));
    expect(res.templates[0].name).toBe('Newer');
    expect(res.cursor).toBe(1);

    const newer = await ok(req({ templates: [template({ name: 'Newest', updatedAt: '2026-11-04T00:00:00.000Z' })] }));
    expect(newer.templates[0].name).toBe('Newest');
  });

  it('replaces children when a document changes', async () => {
    await ok(req({ sessions: [session()] }));
    const edited = session({ updatedAt: T3 });
    edited.exercises[0].sets = [edited.exercises[0].sets[1]];
    const res = await ok(req({ sessions: [edited] }));
    expect(res.sessions[0].exercises[0].sets.map((s) => s.id)).toEqual(['s-2']);
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM sets').get()).toEqual({ n: 1 });
  });

  it('stores tombstones and drops their children', async () => {
    await ok(req({ templates: [template()], sessions: [session()] }));
    const res = await ok(
      req({
        templates: [template({ updatedAt: T3, deletedAt: T3 })],
        sessions: [session({ updatedAt: T3, deletedAt: T3 })],
      }),
    );
    expect(res.templates[0]).toMatchObject({ id: 'tpl-1', deletedAt: T3, exercises: [] });
    expect(res.sessions[0]).toMatchObject({ id: 'ses-1', deletedAt: T3, exercises: [] });
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM sets').get()).toEqual({ n: 0 });
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM template_exercises').get()).toEqual({ n: 0 });
  });

  it('does not resurrect a deleted document from an older copy', async () => {
    await ok(req({ sessions: [session({ updatedAt: T3, deletedAt: T3 })] }));
    const res = await ok(req({ sessions: [session()] }));
    expect(res.sessions[0].deletedAt).toBe(T3);
  });
});
