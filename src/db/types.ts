export type SqlValue = string | number | null;

/**
 * Minimal database interface the app's repositories depend on.
 * The app uses expo-sqlite (see ./expo.ts); tests use node:sqlite (see ./__tests__/node-db.ts).
 */
export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  transaction(fn: () => Promise<void>): Promise<void>;
}
