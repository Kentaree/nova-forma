import { bestSet, prScore, prSetIds, volumeKg } from '@/domain/records';
import type { LoggedSet, SetType } from '@/domain/types';

let i = 0;
const s = (weightKg: number | null, reps: number | null, setType: SetType = 'working', extra: Partial<LoggedSet> = {}): LoggedSet => ({
  id: `s${i++}`,
  position: i,
  setType,
  weightKg,
  reps,
  durationS: null,
  distanceM: null,
  rpe: null,
  completedAt: '',
  ...extra,
});

describe('records', () => {
  it('scores by estimated 1RM and ignores warm-ups', () => {
    expect(prScore('weight_reps', s(100, 1))).toBe(100);
    expect(prScore('weight_reps', s(100, 5))).toBeCloseTo(116.67, 1);
    expect(prScore('weight_reps', s(200, 1, 'warmup'))).toBeNull();
    expect(prScore('weight_reps', s(50, 20))).toBe(50); // too many reps for a 1RM estimate
  });

  it('picks the best set', () => {
    const sets = [s(100, 5), s(110, 2), s(80, 10)];
    // e1RM: 100×5 = 116.7, 110×2 = 117.3, 80×10 = 106.7
    expect(bestSet('weight_reps', sets)?.weightKg).toBe(110);
  });

  it('flags only sets that beat the previous best, once per new high', () => {
    const today = [s(100, 5), s(100, 5), s(105, 5), s(90, 5)];
    const ids = prSetIds('weight_reps', today, prScore('weight_reps', s(100, 4))!);
    expect([...ids]).toEqual([today[0].id, today[2].id]);
    expect(prSetIds('weight_reps', today, null).size).toBe(0);
  });

  it('scores time and cardio', () => {
    expect(prScore('time', s(null, null, 'working', { durationS: 60 }))).toBe(60);
    expect(prScore('cardio', s(null, null, 'working', { distanceM: 5000, durationS: 1500 }))).toBe(5000);
  });

  it('sums working-set volume', () => {
    expect(volumeKg([s(100, 5), s(60, 5, 'warmup'), s(null, 10)])).toBe(500);
  });
});
