import { migrate } from './migrations';
import { seedLibrary } from './seed';
import type { Db } from './types';

export async function initDatabase(db: Db): Promise<void> {
  await db.exec('PRAGMA journal_mode = WAL;');
  await migrate(db);
  await seedLibrary(db);
}
