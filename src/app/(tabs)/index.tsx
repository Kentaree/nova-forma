import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Screen, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatDuration } from '@/domain/format';
import { useDb } from '@/hooks/use-db';
import { useNow } from '@/hooks/use-now';
import { usePalette } from '@/hooks/use-palette';
import { useQuery } from '@/hooks/use-query';
import { getActiveSession, startSession, type Session } from '@/repo/sessions';
import { createTemplate, listTemplates, startSessionFromTemplate } from '@/repo/templates';

export default function WorkoutScreen() {
  const db = useDb();
  const p = usePalette();
  const { data } = useQuery(async () => ({ active: await getActiveSession(db), templates: await listTemplates(db) }));

  const open = (id: string) => router.push({ pathname: '/session/[id]', params: { id } });

  async function startEmpty() {
    open((await startSession(db, randomUUID())).id);
  }

  async function startFrom(templateId: string) {
    open((await startSessionFromTemplate(db, templateId, randomUUID(), () => randomUUID())).id);
  }

  async function newTemplate() {
    const id = randomUUID();
    await createTemplate(db, id, 'New template');
    router.push({ pathname: '/template/[id]', params: { id } });
  }

  if (!data) return <Screen />;
  const { active, templates } = data;

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
          <T variant="title">Workout</T>
          {active ? (
            <ActiveCard session={active} />
          ) : (
            <Card>
              <T variant="heading">Ready when you are</T>
              <T variant="secondary">
                {templates.length ? 'Pick a template below, or start empty and add exercises as you go.' : 'Start a session and add exercises as you go.'}
              </T>
              <Button label="Start empty workout" onPress={startEmpty} kind={templates.length ? 'secondary' : 'primary'} />
            </Card>
          )}

          <View style={{ gap: Spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <T variant="heading" style={{ flex: 1 }}>
                Templates
              </T>
              <Pressable onPress={newTemplate} hitSlop={12} accessibilityRole="button">
                <T style={{ color: p.accent, fontWeight: '700' }}>+ New</T>
              </Pressable>
            </View>
            {templates.length === 0 && (
              <T variant="secondary">
                Save a finished workout as a template from History, or build one with + New.
              </T>
            )}
            {templates.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })}
                style={({ pressed }) => ({
                  backgroundColor: p.surface,
                  borderRadius: Radius.md,
                  padding: Spacing.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Spacing.md,
                  opacity: pressed ? 0.7 : 1,
                })}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T style={{ fontWeight: '700' }}>{t.name}</T>
                  <T variant="caption" numberOfLines={2}>
                    {t.exerciseNames.join(', ') || 'No exercises yet'}
                  </T>
                </View>
                {!active && t.exerciseNames.length > 0 && (
                  <Pressable
                    accessibilityLabel={`Start ${t.name}`}
                    onPress={() => startFrom(t.id)}
                    hitSlop={8}
                    style={({ pressed }) => ({
                      backgroundColor: p.accent,
                      borderRadius: Radius.md,
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      opacity: pressed ? 0.8 : 1,
                    })}>
                    <T style={{ color: p.onAccent, fontWeight: '700' }}>Start</T>
                  </Pressable>
                )}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function ActiveCard({ session }: { session: Session }) {
  const now = useNow(1000);
  return (
    <Card>
      <T variant="caption">IN PROGRESS · {formatDuration((now - Date.parse(session.startedAt)) / 1000)}</T>
      <T variant="heading">{session.name}</T>
      <Button label="Resume workout" onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })} />
    </Card>
  );
}
