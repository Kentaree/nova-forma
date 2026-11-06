import { suggestNextSet } from '@/domain/prefill';
import type { LoggedSet, SetType } from '@/domain/types';

let i = 0;
const set = (weightKg: number | null, reps: number | null, setType: SetType = 'working'): LoggedSet => ({
  id: String(i++),
  position: i,
  setType,
  weightKg,
  reps,
  durationS: null,
  distanceM: null,
  rpe: null,
  completedAt: '',
});

describe('suggestNextSet', () => {
  it('uses defaults with no history', () => {
    expect(suggestNextSet('weight_reps', [], [])).toMatchObject({ weightKg: 20, reps: 8 });
    expect(suggestNextSet('time', [], [])).toMatchObject({ durationS: 30 });
  });

  it('matches set N today to set N last time, ignoring warm-ups on both sides', () => {
    const last = [set(60, 5, 'warmup'), set(100, 5), set(100, 4)];
    expect(suggestNextSet('weight_reps', [], last)).toMatchObject({ weightKg: 100, reps: 5 });
    const today = [set(60, 5, 'warmup'), set(100, 5)];
    expect(suggestNextSet('weight_reps', today, last)).toMatchObject({ weightKg: 100, reps: 4 });
  });

  it('follows on from a warm-up just logged', () => {
    expect(suggestNextSet('weight_reps', [set(60, 5, 'warmup')], [set(100, 5)])).toMatchObject({ weightKg: 60 });
  });

  it('keeps today\'s heavier weight over last time', () => {
    const today = [set(105, 5)];
    expect(suggestNextSet('weight_reps', today, [set(100, 5), set(100, 5)])).toMatchObject({ weightKg: 105, reps: 5 });
  });

  it('repeats the last set once past last time\'s set count', () => {
    expect(suggestNextSet('weight_reps', [set(100, 5), set(100, 3)], [set(100, 5)])).toMatchObject({
      weightKg: 100,
      reps: 3,
    });
  });
});
