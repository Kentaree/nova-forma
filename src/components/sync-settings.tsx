import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Card, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useDb } from '@/hooks/use-db';
import { usePalette } from '@/hooks/use-palette';
import { confirm } from '@/lib/confirm';
import { saveSyncConfig } from '@/sync/config';
import { startFresh } from '@/sync/engine';
import { useSync } from '@/sync/sync-provider';

/** Settings card for connecting to a Nova Forma sync server and seeing how sync is doing. */
export function SyncSettings() {
  const db = useDb();
  const p = usePalette();
  const sync = useSync();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

  const input = {
    backgroundColor: p.background,
    color: p.text,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: 16,
  };

  async function connect() {
    setSaving(true);
    try {
      await saveSyncConfig(db, { url, token });
      await startFresh(db);
      setUrl('');
      setToken('');
      sync.requestSync();
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    const ok = await confirm('Stop syncing?', 'Your data stays on this phone and on the server.', {
      confirmText: 'Stop syncing',
      destructive: true,
    });
    if (!ok) return;
    await saveSyncConfig(db, null);
    sync.requestSync();
  }

  if (!sync.configured) {
    return (
      <Card>
        <T variant="heading">Sync</T>
        <T variant="secondary">
          Back up your workouts to your own Nova Forma server and keep them in step across devices. This is also how
          Claude or ChatGPT will see your training.
        </T>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="Server URL, e.g. nova-forma-api.you.workers.dev"
          placeholderTextColor={p.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={input}
        />
        <TextInput
          value={token}
          onChangeText={setToken}
          placeholder="Sync token"
          placeholderTextColor={p.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={input}
        />
        <Button
          label={saving ? 'Connecting…' : 'Connect'}
          disabled={saving || !url.trim() || !token.trim()}
          onPress={connect}
        />
      </Card>
    );
  }

  return (
    <Card>
      <T variant="heading">Sync</T>
      <T variant="secondary">{describe(sync)}</T>
      {sync.error && <T style={{ color: p.danger }}>{sync.error}</T>}
      <View style={{ flexDirection: 'row', gap: Spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button
            kind="secondary"
            label={sync.syncing ? 'Syncing…' : 'Sync now'}
            disabled={sync.syncing}
            onPress={sync.requestSync}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" label="Disconnect" onPress={disconnect} />
        </View>
      </View>
    </Card>
  );
}

function describe(s: { lastSyncedAt: string | null; pending: number; syncing: boolean }): string {
  if (s.syncing) return 'Syncing…';
  const last = s.lastSyncedAt ? `Last synced ${ago(s.lastSyncedAt)}.` : 'Not synced yet.';
  const pending = s.pending ? ` ${s.pending} change${s.pending === 1 ? '' : 's'} waiting to upload.` : ' Everything is up to date.';
  return last + pending;
}

function ago(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
