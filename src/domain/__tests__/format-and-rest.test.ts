import { formatDuration, formatSet, parseDuration } from '@/domain/format';
import { adjustRest, remainingSeconds, shouldRestAfter, startRest } from '@/domain/rest-timer';
import { toKg } from '@/domain/units';

const v = { weightKg: null, reps: null, durationS: null, distanceM: null };

describe('formatSet', () => {
  it('formats each log type', () => {
    expect(formatSet('weight_reps', { ...v, weightKg: 102.5, reps: 5 }, 'kg')).toBe('102.5×5');
    expect(formatSet('weight_reps', { ...v, weightKg: toKg(225, 'lb'), reps: 5 }, 'lb')).toBe('225×5');
    expect(formatSet('reps', { ...v, reps: 12 }, 'kg')).toBe('12 reps');
    expect(formatSet('reps', { ...v, weightKg: 10, reps: 8 }, 'kg')).toBe('+10×8');
    expect(formatSet('time', { ...v, durationS: 45 }, 'kg')).toBe('0:45');
    expect(formatSet('cardio', { ...v, distanceM: 2000, durationS: 492 }, 'kg')).toBe('2 km · 8:12');
  });

  it('formats durations', () => {
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});

describe('rest timer', () => {
  it('counts down from an absolute end time', () => {
    const t = startRest(90, 1_000);
    expect(remainingSeconds(t, 1_000)).toBe(90);
    expect(remainingSeconds(t, 61_500)).toBe(30);
    expect(remainingSeconds(t, 200_000)).toBe(0);
  });

  it('adjusts, and clears when adjusted to zero', () => {
    const t = startRest(60, 0);
    expect(remainingSeconds(adjustRest(t, 15, 10_000)!, 10_000)).toBe(65);
    expect(adjustRest(t, -60, 10_000)).toBeNull();
  });

  it('only rests after the last exercise of a superset', () => {
    expect(shouldRestAfter('a', null)).toBe(true);
    expect(shouldRestAfter('a', ['a', 'b'])).toBe(false);
    expect(shouldRestAfter('b', ['a', 'b'])).toBe(true);
  });
});

describe('parseDuration', () => {
  it('parses seconds, m:ss and h:mm:ss', () => {
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1:02:05')).toBe(3725);
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });
});
