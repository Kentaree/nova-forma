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
