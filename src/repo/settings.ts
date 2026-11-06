import type { Db } from '@/db/types';
import type { WeightUnit } from '@/domain/types';

export interface Settings {
  weightUnit: WeightUnit;
  defaultRestSeconds: number;
}

export const DEFAULT_SETTINGS: Settings = { weightUnit: 'kg', defaultRestSeconds: 120 };

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.all<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN ('weight_unit', 'default_rest_seconds')`,
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    weightUnit: map.weight_unit === 'lb' ? 'lb' : DEFAULT_SETTINGS.weightUnit,
    defaultRestSeconds: Number(map.default_rest_seconds) || DEFAULT_SETTINGS.defaultRestSeconds,
  };
}

export async function saveSettings(db: Db, patch: Partial<Settings>): Promise<void> {
  const entries: [string, string][] = [];
  if (patch.weightUnit) entries.push(['weight_unit', patch.weightUnit]);
  if (patch.defaultRestSeconds) entries.push(['default_rest_seconds', String(patch.defaultRestSeconds)]);
  for (const [key, value] of entries) {
    await db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }
}
