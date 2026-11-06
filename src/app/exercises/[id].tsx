import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { Card, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import library from '@/data/exercises.json';
import { LOG_TYPE_LABELS, titleCase } from '@/domain/labels';
import { useDb } from '@/hooks/use-db';
import { useQuery } from '@/hooks/use-query';
import { getExercise } from '@/repo/exercises';

const EQUIPMENT_NAMES = Object.fromEntries(library.equipment.map((e) => [e.id, e.name]));

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const { data: ex } = useQuery(() => getExercise(db, id));

  if (ex === undefined) return <Screen />;
  if (ex === null)
    return (
      <Screen style={{ padding: Spacing.lg }}>
        <T>Exercise not found.</T>
      </Screen>
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: ex.name }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
        <T variant="title">{ex.name}</T>
        <Card>
          <Row label="Logged as" value={LOG_TYPE_LABELS[ex.logType]} />
          <Row label="Primary" value={ex.primaryMuscles.map(titleCase).join(', ') || '—'} />
          {ex.secondaryMuscles.length > 0 && <Row label="Secondary" value={ex.secondaryMuscles.map(titleCase).join(', ')} />}
          {ex.equipment.length > 0 && (
            <Row label="Equipment" value={ex.equipment.map((e) => EQUIPMENT_NAMES[e] ?? e).join(', ')} />
          )}
        </Card>
        {ex.description && <T variant="secondary">{ex.description}</T>}
        {ex.instructions.length > 0 && (
          <Card>
            <T variant="heading">How to</T>
            {ex.instructions.map((step, i) => (
              <T key={i} variant="secondary">
                {i + 1}. {step}
              </T>
            ))}
          </Card>
        )}
        <Card>
          <T variant="heading">History</T>
          <T variant="secondary">Your sets, best lift and progress for this exercise will show here once you log it.</T>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <T variant="secondary">
      <T variant="secondary" style={{ fontWeight: '600' }}>
        {label}:{' '}
      </T>
      {value}
    </T>
  );
}
