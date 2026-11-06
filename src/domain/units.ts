import type { WeightUnit } from './types';

export const KG_PER_LB = 0.45359237;

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

/** Formats a stored kg weight in the user's unit, trimming needless decimals ("100", "102.5", "225"). */
export function formatWeight(kg: number, unit: WeightUnit): string {
  const v = Math.round(fromKg(kg, unit) * 100) / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '')} ${unit}`;
}

/**
 * Estimated one-rep max (Epley). Returns null when it isn't meaningful:
 * no weight, no reps, or more than 12 reps where the estimate gets unreliable.
 */
export function estimateOneRepMax(weightKg: number | null, reps: number | null): number | null {
  if (!weightKg || !reps || reps < 1 || reps > 12) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}
