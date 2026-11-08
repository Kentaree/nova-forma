import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Db } from '@/db/types';

/**
 * Where to sync. The server URL is an ordinary setting; the token is a secret, so it goes
 * in the iOS Keychain / Android Keystore (localStorage on the web preview).
 */
export interface SyncConfig {
  url: string;
  token: string;
}

const TOKEN_KEY = 'sync_token';

async function readToken(): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function writeToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (token) globalThis.localStorage?.setItem(TOKEN_KEY, token);
    else globalThis.localStorage?.removeItem(TOKEN_KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getSyncConfig(db: Db): Promise<SyncConfig | null> {
  const row = await db.first<{ value: string }>(`SELECT value FROM settings WHERE key = 'sync_url'`);
  const token = await readToken();
  return row?.value && token ? { url: row.value, token } : null;
}

/** "nova-forma-api.me.workers.dev/" → "https://nova-forma-api.me.workers.dev" */
export function normalizeUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

export async function saveSyncConfig(db: Db, config: SyncConfig | null): Promise<void> {
  if (config) {
    await db.run(
      `INSERT INTO settings (key, value) VALUES ('sync_url', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [normalizeUrl(config.url)],
    );
  } else {
    await db.run(`DELETE FROM settings WHERE key = 'sync_url'`);
  }
  await writeToken(config?.token.trim() || null);
}
