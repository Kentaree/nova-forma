import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Stepper } from '@/components/stepper';
import { Button, Screen, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { titleCase } from '@/domain/labels';
import { useDb } from '@/hooks/use-db';
import { usePalette } from '@/hooks/use-palette';
import { useQuery } from '@/hooks/use-query';
import { confirm } from '@/lib/confirm';
import { showItemMenu } from '@/lib/item-menu';
import {
  deleteTemplate,
  getTemplate,
  moveTemplateExercise,
  removeTemplateExercise,
  renameTemplate,
  startSessionFromTemplate,
  toggleTemplateSuperset,
  updateTemplateTarget,
  type TemplateExercise,
} from '@/repo/templates';

export default function TemplateEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const p = usePalette();
  const { data: t, reload } = useQuery(() => getTemplate(db, id), id);
  const [name, setName] = useState<string | null>(null);

  if (t === undefined) return <Screen />;
  if (t === null)
    return (
      <Screen style={{ padding: Spacing.lg }}>
        <T>This template was deleted.</T>
      </Screen>
    );

  const mutate = (fn: () => Promise<unknown>) => fn().finally(reload);

  async function start() {
    const s = await startSessionFromTemplate(db, id, randomUUID(), () => randomUUID());
    router.replace({ pathname: '/session/[id]', params: { id: s.id } });
  }

  async function remove() {
    if (await confirm(`Delete "${t!.name}"?`, 'Workouts you already logged from it are kept.', { confirmText: 'Delete', destructive: true })) {
      await deleteTemplate(db, id);
      router.back();
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Template' }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl * 2 }}>
        <TextInput
          value={name ?? t.name}
          onChangeText={setName}
          onBlur={() => name !== null && mutate(() => renameTemplate(db, id, name)).then(() => setName(null))}
          placeholder="Template name"
          placeholderTextColor={p.textSecondary}
          accessibilityLabel="Template name"
          style={{ color: p.text, fontSize: 28, fontWeight: '800', paddingVertical: Spacing.xs }}
        />
        {t.exercises.length > 0 && <Button label="Start workout" onPress={start} />}
        {t.exercises.length === 0 && <T variant="secondary">Add the exercises you want in this workout, with target sets and reps.</T>}
        {t.exercises.map((e, i) => (
          <TemplateCard
            key={e.id}
            item={e}
            isFirst={i === 0}
            isLast={i === t.exercises.length - 1}
            linkedToNext={e.supersetGroup != null && t.exercises[i + 1]?.supersetGroup === e.supersetGroup}
            onTarget={(target) => mutate(() => updateTemplateTarget(db, e.id, target))}
            onMove={(dir) => mutate(() => moveTemplateExercise(db, e.id, dir))}
            onToggleSuperset={() => mutate(() => toggleTemplateSuperset(db, e.id))}
            onRemove={() => mutate(() => removeTemplateExercise(db, e.id))}
          />
        ))}
        <Button kind="secondary" label="+ Add exercise" onPress={() => router.push({ pathname: '/template/[id]/add', params: { id } })} />
        <View style={{ alignItems: 'center', marginTop: Spacing.lg }}>
          <Pressable onPress={remove} hitSlop={12}>
            <Text style={{ color: p.danger, fontSize: 15 }}>Delete template</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function TemplateCard({
  item,
  isFirst,
  isLast,
  linkedToNext,
  onTarget,
  onMove,
  onToggleSuperset,
  onRemove,
}: {
  item: TemplateExercise;
  isFirst: boolean;
  isLast: boolean;
  linkedToNext: boolean;
  onTarget: (t: TemplateExercise['target']) => void;
  onMove: (dir: -1 | 1) => void;
  onToggleSuperset: () => void;
  onRemove: () => void;
}) {
  const p = usePalette();
  const { exercise, target } = item;
  const grouped = item.supersetGroup != null;
  const usesReps = exercise.logType === 'weight_reps' || exercise.logType === 'reps';

  return (
    <View
      style={[
        { backgroundColor: p.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
        grouped && { borderLeftWidth: 4, borderLeftColor: p.accent },
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }}>
        <View style={{ flex: 1 }}>
          {grouped && (
            <T variant="caption" style={{ color: p.accent, fontWeight: '700' }}>
              SUPERSET
            </T>
          )}
          <T variant="heading">{exercise.name}</T>
          <T variant="caption">{exercise.primaryMuscles.map(titleCase).join(', ')}</T>
        </View>
        <Pressable
          accessibilityLabel={`Options for ${exercise.name}`}
          hitSlop={12}
          onPress={() => showItemMenu(exercise.name, { isFirst, isLast, linkedToNext, onMove, onToggleSuperset, onRemove })}>
          <Text style={{ color: p.textSecondary, fontSize: 22, fontWeight: '700' }}>•••</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        <Stepper label="SETS" value={target.sets ?? 0} step={1} keyboardType="number-pad" onChange={(sets) => onTarget({ ...target, sets: sets || null })} />
        {usesReps && (
          <>
            <Stepper
              label="REPS FROM"
              value={target.repsMin ?? 0}
              step={1}
              keyboardType="number-pad"
              onChange={(repsMin) =>
                onTarget({ ...target, repsMin: repsMin || null, repsMax: Math.max(repsMin, target.repsMax ?? 0) || null })
              }
            />
            <Stepper
              label="TO"
              value={target.repsMax ?? 0}
              min={target.repsMin ?? 0}
              step={1}
              keyboardType="number-pad"
              onChange={(repsMax) => onTarget({ ...target, repsMax: repsMax || null })}
            />
          </>
        )}
      </View>
    </View>
  );
}
