import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { ProgressChart } from '@/components/progress-chart';
import { Card, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import library from '@/data/exercises.json';
import { formatDuration, formatSet, trimNumber } from '@/domain/format';
import { LOG_TYPE_LABELS, titleCase } from '@/domain/labels';
import { bestSet, prScore } from '@/domain/records';
import type { LogType, WeightUnit } from '@/domain/types';
import { fromKg } from '@/domain/units';
import { useDb } from '@/hooks/use-db';
import { useQuery } from '@/hooks/use-query';
import { useSettings } from '@/hooks/use-settings';
import { formatShortDate } from '@/lib/dates';
import { getExercise } from '@/repo/exercises';
import { exerciseHistory } from '@/repo/history';

const EQUIPMENT_NAMES = Object.fromEntries(library.equipment.map((e) => [e.id, e.name]));

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const { data: ex } = useQuery(() => getExercise(db, id), id);
  const { data: history } = useQuery(() => exerciseHistory(db, id), id);
  const { weightUnit } = useSettings();

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
        <HistorySection logType={ex.logType} history={history ?? []} unit={weightUnit} />
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

function scoreLabel(logType: LogType, v: number, unit: WeightUnit): string {
  if (logType === 'weight_reps') return `${trimNumber(fromKg(v, unit), 1)} ${unit}`;
  if (logType === 'reps') return `${Math.floor(v)} reps`;
  if (logType === 'time') return formatDuration(v);
  return v >= 100 ? `${trimNumber(v / 1000, 2)} km` : formatDuration(v);
}

function HistorySection({
  logType,
  history,
  unit,
}: {
  logType: LogType;
  history: Awaited<ReturnType<typeof exerciseHistory>>;
  unit: WeightUnit;
}) {
  if (!history.length) {
    return (
      <Card>
        <T variant="heading">History</T>
        <T variant="secondary">Your sets, best lift and progress for this exercise will show here once you log it.</T>
      </Card>
    );
  }
  const allSets = history.flatMap((h) => h.sets);
  const best = bestSet(logType, allSets);
  const bestSession = best && history.find((h) => h.sets.includes(best));
  const points = history
    .slice(0, 12)
    .reverse()
    .map((h) => {
      const b = bestSet(logType, h.sets);
      return b ? { label: formatShortDate(h.date), value: prScore(logType, b)! } : null;
    })
    .filter((x): x is { label: string; value: number } => x !== null);

  return (
    <>
      {best && (
        <Card>
          <T variant="heading">Personal best</T>
          <T style={{ fontSize: 22, fontWeight: '800' }}>{formatSet(logType, best, unit)}</T>
          <T variant="caption">
            {logType === 'weight_reps' ? `Est. 1RM ${scoreLabel(logType, prScore(logType, best)!, unit)} · ` : ''}
            {bestSession ? formatShortDate(bestSession.date) : ''}
          </T>
        </Card>
      )}
      {points.length >= 2 && (
        <Card>
          <T variant="heading">{logType === 'weight_reps' ? 'Best est. 1RM per workout' : 'Best per workout'}</T>
          <ProgressChart points={points} format={(v) => scoreLabel(logType, v, unit)} />
        </Card>
      )}
      <Card>
        <T variant="heading">Recent</T>
        {history.slice(0, 10).map((h) => (
          <T key={h.sessionId} variant="secondary">
            <T variant="secondary" style={{ fontWeight: '600' }}>
              {formatShortDate(h.date)}:{' '}
            </T>
            {h.sets
              .filter((s) => s.setType !== 'warmup')
              .map((s) => formatSet(logType, s, unit))
              .join(', ')}
          </T>
        ))}
      </Card>
    </>
  );
}
