import type { SQLiteDatabase } from 'expo-sqlite';

import type { Db, SqlValue } from './types';

export function fromExpo(db: SQLiteDatabase): Db {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlValue[] = []) => {
      await db.runAsync(sql, params);
    },
    all: (sql, params: SqlValue[] = []) => db.getAllAsync(sql, params),
    first: (sql, params: SqlValue[] = []) => db.getFirstAsync(sql, params),
    transaction: (fn) => db.withTransactionAsync(fn),
  };
}
