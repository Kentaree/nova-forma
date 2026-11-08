import type { Statement, SqlValue, Store } from './store';

export function d1Store(db: D1Database): Store {
  const prep = (s: Statement) => db.prepare(s.sql).bind(...s.params);
  return {
    all: async <T>(sql: string, params: SqlValue[] = []) => (await prep({ sql, params }).all<T>()).results,
    first: <T>(sql: string, params: SqlValue[] = []) => prep({ sql, params }).first<T>(),
    batch: async (statements) => {
      if (statements.length) await db.batch(statements.map(prep));
    },
  };
}
