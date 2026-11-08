import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { Db } from '@/db/types';
import { useDb } from '@/hooks/use-db';
import { emitDataChanged } from '@/lib/data-events';

import { getSyncConfig } from './config';
import { getSyncState, runSync } from './engine';
import { httpTransport } from './http';

export interface SyncStatus {
  configured: boolean;
  syncing: boolean;
  lastSyncedAt: string | null;
  pending: number;
  error: string | null;
}

interface SyncContextValue extends SyncStatus {
  /** Sync now (or right after the sync that's already running). Never throws. */
  requestSync: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/**
 * Syncs in the background when the app opens, when it comes back to the foreground,
 * when it goes to the background, and whenever a screen asks (e.g. after a workout).
 * Does nothing until a server is set up in Settings.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const [status, setStatus] = useState<SyncStatus>({
    configured: false,
    syncing: false,
    lastSyncedAt: null,
    pending: 0,
    error: null,
  });
  const running = useRef(false);
  const again = useRef(false);

  const requestSync = useCallback(() => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    void (async () => {
      do {
        again.current = false;
        await syncOnce(db, setStatus);
      } while (again.current);
      running.current = false;
    })();
  }, [db]);

  useEffect(() => {
    requestSync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') requestSync();
    });
    return () => sub.remove();
  }, [requestSync]);

  const value = useMemo(() => ({ ...status, requestSync }), [status, requestSync]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

async function syncOnce(db: Db, setStatus: (fn: (s: SyncStatus) => SyncStatus) => void): Promise<void> {
  const config = await getSyncConfig(db).catch(() => null);
  const local = await getSyncState(db);
  if (!config) {
    setStatus((s) => ({ ...s, ...local, configured: false, syncing: false, error: null }));
    return;
  }
  setStatus((s) => ({ ...s, ...local, configured: true, syncing: true }));
  try {
    const { pulled } = await runSync(db, httpTransport(config));
    setStatus((s) => ({ ...s, syncing: false, error: null }));
    if (pulled > 0) emitDataChanged();
  } catch (e) {
    setStatus((s) => ({ ...s, syncing: false, error: (e as Error).message }));
  }
  const after = await getSyncState(db);
  setStatus((s) => ({ ...s, ...after }));
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
