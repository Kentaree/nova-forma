import { estimateOneRepMax, formatWeight, fromKg, toKg } from '@/domain/units';

describe('units', () => {
  it('round-trips kg and lb', () => {
    expect(fromKg(toKg(225, 'lb'), 'lb')).toBeCloseTo(225);
    expect(toKg(100, 'kg')).toBe(100);
  });

  it('formats weights', () => {
    expect(formatWeight(100, 'kg')).toBe('100 kg');
    expect(formatWeight(102.5, 'kg')).toBe('102.5 kg');
    expect(formatWeight(toKg(225, 'lb'), 'lb')).toBe('225 lb');
  });

  it('estimates 1RM', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.67, 1);
    expect(estimateOneRepMax(100, 15)).toBeNull();
    expect(estimateOneRepMax(null, 5)).toBeNull();
  });
});
