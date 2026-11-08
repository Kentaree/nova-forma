import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeEach, describe, expect, it } from 'vitest';

import { SYNC_PROTOCOL_VERSION, type SessionDoc } from '../../shared/sync-protocol';
import { createMcpServer } from '../src/mcp/server';
import { applyChanges, changesSince } from '../src/sync';
import { sqliteStore } from './sqlite-store';

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const workout = (id: string, startedAt: string, sets: [number, number][]): SessionDoc => ({
  id,
  templateId: null,
  name: 'Push',
  startedAt,
  endedAt: new Date(Date.parse(startedAt) + 3_600_000).toISOString(),
  notes: null,
  updatedAt: startedAt,
  deletedAt: null,
  exercises: [
    {
      id: `${id}-se`,
      exerciseId: 'barbell-bench-press',
      position: 0,
      supersetGroup: null,
      targetSets: null,
      targetRepsMin: null,
      targetRepsMax: null,
      sets: sets.map(([kg, reps], i) => ({
        id: `${id}-s${i}`,
        position: i,
        setType: 'working' as const,
        weightKg: kg,
        reps,
        durationS: null,
        distanceM: null,
        rpe: null,
        completedAt: startedAt,
      })),
    },
  ],
});

let store: ReturnType<typeof sqliteStore>;
let client: Client;

beforeEach(async () => {
  store = sqliteStore();
  await applyChanges(store, {
    protocol: SYNC_PROTOCOL_VERSION,
    cursor: 0,
    exercises: [
      {
        id: 'custom-1',
        name: 'Belt squat',
        category: 'strength',
        logType: 'weight_reps',
        primaryMuscles: ['quads'],
        secondaryMuscles: [],
        equipment: ['machine'],
        instructions: [],
        description: null,
        archived: false,
        updatedAt: daysAgo(30),
        deletedAt: null,
      },
    ],
    templates: [],
    sessions: [workout('w1', daysAgo(10), [[90, 5], [90, 5]]), workout('w2', daysAgo(3), [[95, 5], [100, 3]])],
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createMcpServer(store).connect(a);
  client = new Client({ name: 'test', version: '1' });
  await client.connect(b);
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  return { error: res.isError ?? false, text: res.content[0].text, data: res.isError ? null : JSON.parse(res.content[0].text) };
}

describe('MCP tools', () => {
  it('lists its tools with descriptions', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'delete_template',
      'get_exercise_progress',
      'get_recent_workouts',
      'list_exercises',
      'list_templates',
      'save_template',
    ]);
    expect(tools.every((t) => (t.description ?? '').length > 20)).toBe(true);
  });

  it('searches built-in and custom exercises', async () => {
    const bench = await call('list_exercises', { query: 'bench' });
    expect(bench.data.map((e: { id: string }) => e.id)).toContain('barbell-bench-press');
    const quads = await call('list_exercises', { muscle: 'quads' });
    expect(quads.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'custom-1', custom: true })]));
  });

  it('returns recent workouts newest first, within the window', async () => {
    const res = await call('get_recent_workouts', { days: 7 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      id: 'w2',
      durationMinutes: 60,
      exercises: [{ name: 'Barbell Bench Press', sets: [{ kg: 95, reps: 5 }, { kg: 100, reps: 3 }] }],
    });
    expect((await call('get_recent_workouts')).data.map((w: { id: string }) => w.id)).toEqual(['w2', 'w1']);
  });

  it('reports exercise progress with estimated 1RM', async () => {
    const res = await call('get_exercise_progress', { exerciseId: 'barbell-bench-press' });
    expect(res.data.sessions).toHaveLength(2);
    expect(res.data.sessions[0].estimated1RmKg).toBe(110.8); // 95 × 5 beats 100 × 3: 95 × (1 + 5/30)
    expect(res.data.bestInPeriod).toMatchObject({ set: { kg: 95, reps: 5 }, estimated1RmKg: 110.8 });
    expect((await call('get_exercise_progress', { exerciseId: 'nope' })).error).toBe(true);
  });

  it('creates, replaces and deletes templates, and they sync to the app', async () => {
    const before = (await changesSince(store, 0)).cursor;
    const saved = await call('save_template', {
      name: 'Push A',
      notes: 'Add 2.5 kg when you hit the top of the range',
      exercises: [
        { exerciseId: 'barbell-bench-press', sets: 4, repsMin: 5, repsMax: 8 },
        { exerciseId: 'custom-1', sets: 3, repsMin: 12, repsMax: 8, supersetGroup: 1 },
      ],
    });
    expect(saved.data).toMatchObject({ saved: true, exercises: 2 });

    const pulled = await changesSince(store, before);
    expect(pulled.templates).toHaveLength(1);
    expect(pulled.templates[0].exercises[1]).toMatchObject({ targetRepsMin: 8, targetRepsMax: 12, supersetGroup: 1 });

    const list = await call('list_templates');
    expect(list.data[0]).toMatchObject({ id: saved.data.id, name: 'Push A', exercises: [{ sets: 4 }, { name: 'Belt squat' }] });

    await call('save_template', { id: saved.data.id, name: 'Push B', exercises: [{ exerciseId: 'barbell-bench-press', sets: 5, repsMin: 5, repsMax: 5 }] });
    expect((await call('list_templates')).data).toMatchObject([{ name: 'Push B', exercises: [{ sets: 5 }] }]);

    expect((await call('delete_template', { id: saved.data.id })).data).toEqual({ deleted: true, id: saved.data.id });
    expect((await call('list_templates')).data).toEqual([]);
    const tomb = await changesSince(store, before);
    expect(tomb.templates[0].deletedAt).not.toBeNull();
  });

  it('rejects unknown exercises and templates with a helpful error', async () => {
    const res = await call('save_template', { name: 'X', exercises: [{ exerciseId: 'made-up', sets: 3, repsMin: 8, repsMax: 12 }] });
    expect(res).toMatchObject({ error: true });
    expect(res.text).toContain('list_exercises');
    expect((await call('delete_template', { id: 'missing' })).error).toBe(true);
  });
});
