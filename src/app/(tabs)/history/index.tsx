import { router } from 'expo-router';
import { FlatList, Pressable } from 'react-native';

import { Screen, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { trimNumber } from '@/domain/format';
import { fromKg } from '@/domain/units';
import { useDb } from '@/hooks/use-db';
import { usePalette } from '@/hooks/use-palette';
import { useQuery } from '@/hooks/use-query';
import { useSettings } from '@/hooks/use-settings';
import { formatDay, minutesBetween } from '@/lib/dates';
import { listSessions } from '@/repo/history';

export default function HistoryList() {
  const db = useDb();
  const p = usePalette();
  const { weightUnit } = useSettings();
  const { data } = useQuery(() => listSessions(db));

  return (
    <Screen>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={data ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}
        ListEmptyComponent={data ? <T variant="secondary">Finished workouts will show up here.</T> : undefined}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/history/[id]', params: { id: item.id } })}
            style={({ pressed }) => ({
              backgroundColor: p.surface,
              borderRadius: Radius.md,
              padding: Spacing.md,
              gap: 2,
              opacity: pressed ? 0.7 : 1,
            })}>
            <T variant="caption">{formatDay(item.startedAt).toUpperCase()}</T>
            <T style={{ fontWeight: '700' }}>{item.name}</T>
            <T variant="secondary" numberOfLines={2}>
              {item.exerciseNames.join(', ')}
            </T>
            <T variant="caption">
              {minutesBetween(item.startedAt, item.endedAt)} min · {item.setCount} sets
              {item.volumeKg ? ` · ${trimNumber(fromKg(item.volumeKg, weightUnit), 0)} ${weightUnit} lifted` : ''}
            </T>
          </Pressable>
        )}
      />
    </Screen>
  );
}
