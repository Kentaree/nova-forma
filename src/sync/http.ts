import type { SyncResponse } from '../../shared/sync-protocol';
import type { SyncTransport } from './engine';
import type { SyncConfig } from './config';

export class SyncError extends Error {}

/** Sends sync requests to the Nova Forma server over HTTPS. */
export function httpTransport({ url, token }: SyncConfig, timeoutMs = 20_000): SyncTransport {
  return async (req) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${url}/v1/sync`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
    } catch {
      throw new SyncError("Couldn't reach the sync server. Check your connection.");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) throw new SyncError('The sync server rejected the token. Check it in Settings.');
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new SyncError(`Sync failed (${res.status})${body?.error ? `: ${body.error}` : ''}`);
    }
    return (await res.json()) as SyncResponse;
  };
}
