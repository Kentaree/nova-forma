import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExerciseCard } from '@/components/exercise-card';
import { RestBar, useRestTimer } from '@/components/rest-timer';
import { Button, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatDuration } from '@/domain/format';
import { shouldRestAfter } from '@/domain/rest-timer';
import { useDb } from '@/hooks/use-db';
import { useNow } from '@/hooks/use-now';
import { usePalette } from '@/hooks/use-palette';
import { useQuery } from '@/hooks/use-query';
import { useSettings } from '@/hooks/use-settings';
import { confirm } from '@/lib/confirm';
import {
  deleteSet,
  discardSession,
  finishSession,
  getSessionDetail,
  lastPerformance,
  logSet,
  moveSessionExercise,
  removeSessionExercise,
  toggleSupersetWithNext,
  updateSet,
} from '@/repo/sessions';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const p = usePalette();
  const settings = useSettings();
  const rest = useRestTimer();

  const { data, reload } = useQuery(async () => {
    const detail = await getSessionDetail(db, id);
    if (!detail) return null;
    const last = await Promise.all(detail.exercises.map((e) => lastPerformance(db, e.exercise.id, id)));
    return { detail, last };
  }, id);

  if (data === undefined) return <Screen />;
  if (data === null)
    return (
      <Screen style={{ padding: Spacing.lg }}>
        <T>This workout no longer exists.</T>
      </Screen>
    );

  const { detail, last } = data;
  const exercises = detail.exercises;
  const mutate = (fn: () => Promise<unknown>) =>
    fn()
      .catch((e: Error) => Alert.alert('Something went wrong', e.message))
      .finally(reload);

  async function finish() {
    const logged = exercises.reduce((n, e) => n + e.sets.length, 0);
    const ok = await confirm(
      logged ? 'Finish workout?' : 'Nothing logged yet',
      logged ? `${logged} set(s) will be saved.` : 'Finishing now discards this empty workout.',
      { confirmText: logged ? 'Finish' : 'Discard', cancelText: 'Keep going', destructive: !logged },
    );
    if (!ok) return;
    rest.stop();
    await finishSession(db, id);
    router.back();
  }

  async function discard() {
    const ok = await confirm('Discard workout?', 'Everything logged in this session will be deleted.', {
      confirmText: 'Discard',
      destructive: true,
    });
    if (!ok) return;
    rest.stop();
    await discardSession(db, id);
    router.back();
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: detail.name,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Minimise workout">
              <Text style={{ color: p.textSecondary, fontSize: 16 }}>Hide</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={finish} hitSlop={12}>
              <Text style={{ color: p.accent, fontSize: 17, fontWeight: '700' }}>Finish</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl * 2 }}>
          <Elapsed startedAt={detail.startedAt} />
          {exercises.length === 0 && (
            <T variant="secondary">Add your first exercise to get going.</T>
          )}
          {exercises.map((e, i) => {
            const next = exercises[i + 1];
            const linkedToNext = e.supersetGroup != null && next?.supersetGroup === e.supersetGroup;
            const group = e.supersetGroup == null ? null : exercises.filter((x) => x.supersetGroup === e.supersetGroup).map((x) => x.id);
            return (
              <ExerciseCard
                key={e.id}
                item={e}
                last={last[i]}
                unit={settings.weightUnit}
                isFirst={i === 0}
                isLast={i === exercises.length - 1}
                linkedToNext={linkedToNext}
                actions={{
                  onLog: (v) =>
                    mutate(async () => {
                      await logSet(db, e.id, v, randomUUID());
                      if (shouldRestAfter(e.id, group)) rest.start(settings.defaultRestSeconds);
                    }),
                  onSetType: (s, setType) => mutate(() => updateSet(db, s.id, { setType })),
                  onDeleteSet: (s) => mutate(() => deleteSet(db, s.id)),
                  onMove: (dir) => mutate(() => moveSessionExercise(db, e.id, dir)),
                  onToggleSuperset: () => mutate(() => toggleSupersetWithNext(db, e.id)),
                  onRemove: () => mutate(() => removeSessionExercise(db, e.id)),
                }}
              />
            );
          })}
          <Button
            kind="secondary"
            label="+ Add exercise"
            onPress={() => router.push({ pathname: '/session/[id]/add', params: { id } })}
          />
          <View style={{ alignItems: 'center', marginTop: Spacing.lg }}>
            <Pressable onPress={discard} hitSlop={12}>
              <Text style={{ color: p.danger, fontSize: 15 }}>Discard workout</Text>
            </Pressable>
          </View>
        </ScrollView>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: rest.timer ? p.surfaceRaised : 'transparent' }}>
          <RestBar />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const now = useNow(1000);
  return <T variant="caption">ELAPSED {formatDuration((now - Date.parse(startedAt)) / 1000)}</T>;
}
