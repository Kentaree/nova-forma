import type { Db } from '@/db/types';

/**
 * Shared ordering and superset logic for the two "ordered list of exercises" tables:
 * a workout's exercises and a template's exercises. Both have `position` (0-based,
 * contiguous) and `superset_group` (exercises sharing a non-null value form a superset).
 */
export interface ExerciseList {
  table: 'session_exercises' | 'template_exercises';
  parent: 'session_id' | 'template_id';
}

export const SESSION_LIST: ExerciseList = { table: 'session_exercises', parent: 'session_id' };
export const TEMPLATE_LIST: ExerciseList = { table: 'template_exercises', parent: 'template_id' };

export async function nextPosition(db: Db, l: ExerciseList, parentId: string): Promise<number> {
  const { next } = (await db.first<{ next: number }>(
    `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM ${l.table} WHERE ${l.parent} = ?`,
    [parentId],
  ))!;
  return next;
}

export async function parentOf(db: Db, l: ExerciseList, itemId: string): Promise<string | null> {
  const row = await db.first<{ p: string }>(`SELECT ${l.parent} AS p FROM ${l.table} WHERE id = ?`, [itemId]);
  return row?.p ?? null;
}

/** Moves an item one place up (-1) or down (+1). */
export async function moveItem(db: Db, l: ExerciseList, itemId: string, direction: -1 | 1): Promise<void> {
  const row = await db.first<{ p: string; position: number }>(
    `SELECT ${l.parent} AS p, position FROM ${l.table} WHERE id = ?`,
    [itemId],
  );
  if (!row) return;
  const other = await db.first<{ id: string }>(`SELECT id FROM ${l.table} WHERE ${l.parent} = ? AND position = ?`, [
    row.p,
    row.position + direction,
  ]);
  if (!other) return;
  await db.transaction(async () => {
    await db.run(`UPDATE ${l.table} SET position = ? WHERE id = ?`, [row.position, other.id]);
    await db.run(`UPDATE ${l.table} SET position = ? WHERE id = ?`, [row.position + direction, itemId]);
  });
}

/**
 * Toggles a superset link between this item and the next one. Linking joins the next
 * item (and its group, if any) into this one's group; unlinking splits the group here.
 */
export async function toggleSupersetWithNext(db: Db, l: ExerciseList, itemId: string): Promise<void> {
  const rows = await db.all<{ id: string; superset_group: number | null; p: string }>(
    `SELECT id, superset_group, ${l.parent} AS p FROM ${l.table}
     WHERE ${l.parent} = (SELECT ${l.parent} FROM ${l.table} WHERE id = ?) ORDER BY position`,
    [itemId],
  );
  const i = rows.findIndex((r) => r.id === itemId);
  const cur = rows[i];
  const next = rows[i + 1];
  if (!cur || !next) return;

  const set = (group: number, id: string) => db.run(`UPDATE ${l.table} SET superset_group = ? WHERE id = ?`, [group, id]);
  await db.transaction(async () => {
    const linked = cur.superset_group != null && cur.superset_group === next.superset_group;
    if (linked) {
      // Split: everything after `cur` in this group gets a fresh group.
      const fresh = await nextGroup(db, l, cur.p);
      for (const r of rows.slice(i + 1)) {
        if (r.superset_group !== cur.superset_group) break;
        await set(fresh, r.id);
      }
    } else {
      const group = cur.superset_group ?? (await nextGroup(db, l, cur.p));
      await set(group, cur.id);
      const absorb = next.superset_group;
      for (const r of rows.slice(i + 1)) {
        if (r.id !== next.id && (absorb == null || r.superset_group !== absorb)) break;
        await set(group, r.id);
      }
    }
    await dissolveLoneGroups(db, l, cur.p);
  });
}

async function nextGroup(db: Db, l: ExerciseList, parentId: string): Promise<number> {
  const { g } = (await db.first<{ g: number }>(
    `SELECT COALESCE(MAX(superset_group), 0) + 1 AS g FROM ${l.table} WHERE ${l.parent} = ?`,
    [parentId],
  ))!;
  return g;
}

export async function renumber(db: Db, l: ExerciseList, parentId: string): Promise<void> {
  const rows = await db.all<{ id: string }>(`SELECT id FROM ${l.table} WHERE ${l.parent} = ? ORDER BY position`, [
    parentId,
  ]);
  for (let i = 0; i < rows.length; i++) {
    await db.run(`UPDATE ${l.table} SET position = ? WHERE id = ?`, [i, rows[i].id]);
  }
}

/** A "superset" of one exercise isn't one. */
export async function dissolveLoneGroups(db: Db, l: ExerciseList, parentId: string): Promise<void> {
  await db.run(
    `UPDATE ${l.table} SET superset_group = NULL
     WHERE ${l.parent} = ? AND superset_group IN (
       SELECT superset_group FROM ${l.table} WHERE ${l.parent} = ? AND superset_group IS NOT NULL
       GROUP BY superset_group HAVING COUNT(*) < 2)`,
    [parentId, parentId],
  );
}
