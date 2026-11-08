export type SqlValue = string | number | null;
export interface Statement {
  sql: string;
  params: SqlValue[];
}

/**
 * The small slice of a SQL database the server needs. `batch` runs its statements
 * in order inside one transaction (D1 has no interactive transactions, only batches).
 */
export interface Store {
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  batch(statements: Statement[]): Promise<void>;
}

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
