import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Card, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatSet } from '@/domain/format';
import { useDb } from '@/hooks/use-db';
import { usePalette } from '@/hooks/use-palette';
import { useQuery } from '@/hooks/use-query';
import { useSettings } from '@/hooks/use-settings';
import { confirm } from '@/lib/confirm';
import { formatDay, minutesBetween } from '@/lib/dates';
import { discardSession, getSessionDetail } from '@/repo/sessions';
import { saveSessionAsTemplate } from '@/repo/templates';

export default function HistoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const p = usePalette();
  const { weightUnit } = useSettings();
  const { data } = useQuery(() => getSessionDetail(db, id), id);

  if (data === undefined) return <Screen />;
  if (data === null)
    return (
      <Screen style={{ padding: Spacing.lg }}>
        <T>This workout was deleted.</T>
      </Screen>
    );

  async function remove() {
    if (await confirm('Delete workout?', 'This permanently removes it from your history.', { confirmText: 'Delete', destructive: true })) {
      await discardSession(db, id);
      router.back();
    }
  }

  async function saveAsTemplate() {
    const templateId = randomUUID();
    await saveSessionAsTemplate(db, id, templateId, () => randomUUID());
    router.push({ pathname: '/template/[id]', params: { id: templateId } });
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: data.name }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
        <T variant="title">{data.name}</T>
        <T variant="secondary">
          {formatDay(data.startedAt)}
          {data.endedAt ? ` · ${minutesBetween(data.startedAt, data.endedAt)} min` : ''}
        </T>
        {data.exercises.map((e) => {
          let n = 0;
          return (
            <Card key={e.id} style={e.supersetGroup != null ? { borderLeftWidth: 4, borderLeftColor: p.accent } : undefined}>
              <T variant="heading">{e.exercise.name}</T>
              {e.sets.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', gap: Spacing.md }}>
                  <Text style={{ width: 20, fontWeight: '800', color: s.setType === 'warmup' ? p.textSecondary : p.accent }}>
                    {s.setType === 'warmup' ? 'W' : ++n}
                  </Text>
                  <T>
                    {formatSet(e.exercise.logType, s, weightUnit)}
                    {s.setType === 'failure' ? ' (failure)' : ''}
                  </T>
                </View>
              ))}
            </Card>
          );
        })}
        <Button kind="secondary" label="Save as template" onPress={saveAsTemplate} />
        <View style={{ alignItems: 'center', marginTop: Spacing.lg }}>
          <Pressable onPress={remove} hitSlop={12}>
            <Text style={{ color: p.danger, fontSize: 15 }}>Delete workout</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}
