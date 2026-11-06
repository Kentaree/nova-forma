/** @jest-environment node */
import { initDatabase } from '@/db/init';
import { addExerciseToSession, finishSession, getSessionDetail, logSet, startSession, toggleSupersetWithNext } from '@/repo/sessions';
import {
  addExerciseToTemplate,
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  moveTemplateExercise,
  removeTemplateExercise,
  renameTemplate,
  saveSessionAsTemplate,
  startSessionFromTemplate,
  toggleTemplateSuperset,
  updateTemplateTarget,
} from '@/repo/templates';
import { memoryDb } from '@/test/node-db';

let n = 0;
const uid = () => `t-${++n}`;
const v = (weightKg: number | null, reps: number | null) => ({ weightKg, reps, durationS: null, distanceM: null });

async function setup() {
  const db = memoryDb();
  await initDatabase(db);
  return db;
}

describe('templates repo', () => {
  it('builds, edits, lists and deletes templates', async () => {
    const db = await setup();
    await createTemplate(db, 'push', 'Push A');
    await addExerciseToTemplate(db, 'push', 'barbell-bench-press', 'i1');
    await addExerciseToTemplate(db, 'push', 'dumbbell-shoulder-press', 'i2', { sets: 4, repsMin: 6, repsMax: 8 });
    await addExerciseToTemplate(db, 'push', 'dips', 'i3');
    await moveTemplateExercise(db, 'i3', -1);
    await toggleTemplateSuperset(db, 'i3');
    await updateTemplateTarget(db, 'i1', { sets: 5, repsMin: 5, repsMax: 3 }); // max < min is clamped
    await renameTemplate(db, 'push', 'Push Day');

    const t = (await getTemplate(db, 'push'))!;
    expect(t.name).toBe('Push Day');
    expect(t.exercises.map((e) => e.exercise.id)).toEqual(['barbell-bench-press', 'dips', 'dumbbell-shoulder-press']);
    expect(t.exercises[1].supersetGroup).not.toBeNull();
    expect(t.exercises[1].supersetGroup).toBe(t.exercises[2].supersetGroup);
    expect(t.exercises[0].target).toEqual({ sets: 5, repsMin: 5, repsMax: 5 });
    expect(t.exercises[2].target).toEqual({ sets: 4, repsMin: 6, repsMax: 8 });

    await removeTemplateExercise(db, 'i2');
    const after = (await getTemplate(db, 'push'))!;
    expect(after.exercises.map((e) => [e.position, e.supersetGroup])).toEqual([
      [0, null],
      [1, null],
    ]);

    expect((await listTemplates(db)).map((x) => [x.name, x.exerciseNames.length])).toEqual([['Push Day', 2]]);
    await deleteTemplate(db, 'push');
    expect(await listTemplates(db)).toEqual([]);
    expect(await getTemplate(db, 'push')).toBeNull();
  });

  it('lists an empty template', async () => {
    const db = await setup();
    await createTemplate(db, 'e', '  ');
    expect(await listTemplates(db)).toEqual([{ id: 'e', name: 'New template', exerciseNames: [] }]);
  });

  it('saves a finished workout as a template, with targets from what was done', async () => {
    const db = await setup();
    const s = await startSession(db, 's1', { name: 'Pull' });
    await addExerciseToSession(db, s.id, 'deadlift', 'se1');
    await addExerciseToSession(db, s.id, 'pull-ups', 'se2');
    await addExerciseToSession(db, s.id, 'dumbbell-rows', 'se3');
    await toggleSupersetWithNext(db, 'se2');
    await logSet(db, 'se1', { ...v(60, 5), setType: 'warmup' }, uid());
    await logSet(db, 'se1', v(100, 5), uid());
    await logSet(db, 'se1', v(100, 3), uid());
    await logSet(db, 'se2', v(null, 8), uid());
    await logSet(db, 'se3', v(30, 12), uid());
    await finishSession(db, s.id);

    await saveSessionAsTemplate(db, s.id, 'tpl', uid);
    const t = (await getTemplate(db, 'tpl'))!;
    expect(t.name).toBe('Pull');
    expect(t.exercises.map((e) => [e.exercise.id, e.target])).toEqual([
      ['deadlift', { sets: 2, repsMin: 3, repsMax: 5 }],
      ['pull-ups', { sets: 1, repsMin: 8, repsMax: 8 }],
      ['dumbbell-rows', { sets: 1, repsMin: 12, repsMax: 12 }],
    ]);
    expect(t.exercises[1].supersetGroup).not.toBeNull();
    expect(t.exercises[1].supersetGroup).toBe(t.exercises[2].supersetGroup);
  });

  it('starts a workout from a template', async () => {
    const db = await setup();
    await createTemplate(db, 'legs', 'Legs');
    await addExerciseToTemplate(db, 'legs', 'barbell-back-squat', 'l1', { sets: 5, repsMin: 5, repsMax: 5 });
    await addExerciseToTemplate(db, 'legs', 'lying-leg-curl', 'l2');
    await addExerciseToTemplate(db, 'legs', 'leg-extension', 'l3');
    await toggleTemplateSuperset(db, 'l2');

    const s = await startSessionFromTemplate(db, 'legs', 'sess', uid);
    expect(s).toMatchObject({ name: 'Legs', templateId: 'legs', endedAt: null });
    const d = (await getSessionDetail(db, 'sess'))!;
    expect(d.exercises.map((e) => e.exercise.id)).toEqual(['barbell-back-squat', 'lying-leg-curl', 'leg-extension']);
    expect(d.exercises[0].target).toEqual({ sets: 5, repsMin: 5, repsMax: 5 });
    expect(d.exercises[1].supersetGroup).toBe(d.exercises[2].supersetGroup);
    expect(d.exercises[1].supersetGroup).not.toBeNull();
  });
});
