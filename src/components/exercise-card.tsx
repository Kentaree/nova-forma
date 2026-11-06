import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { formatSet } from '@/domain/format';
import { suggestNextSet } from '@/domain/prefill';
import { prSetIds } from '@/domain/records';
import type { LoggedSet, SetType, SetValues, WeightUnit } from '@/domain/types';
import { usePalette } from '@/hooks/use-palette';
import { confirm } from '@/lib/confirm';
import type { SessionExercise } from '@/repo/sessions';

import { SetEntry } from './set-entry';
import { T } from './ui';

const SET_TYPE_LABEL: Record<SetType, string> = { warmup: 'W', working: '', failure: 'F' };

export interface ExerciseCardActions {
  onLog: (v: SetValues & { setType: SetType }) => void;
  onSetType: (set: LoggedSet, type: SetType) => void;
  onDeleteSet: (set: LoggedSet) => void;
  onMove: (dir: -1 | 1) => void;
  onToggleSuperset: () => void;
  onRemove: () => void;
}

export function ExerciseCard({
  item,
  last,
  previousBest,
  unit,
  isFirst,
  isLast,
  linkedToNext,
  actions,
}: {
  item: SessionExercise;
  last: { date: string; sets: LoggedSet[] } | null;
  previousBest: number | null;
  unit: WeightUnit;
  isFirst: boolean;
  isLast: boolean;
  linkedToNext: boolean;
  actions: ExerciseCardActions;
}) {
  const p = usePalette();
  const { exercise, sets } = item;
  const grouped = item.supersetGroup != null;

  function menu() {
    const buttons: { text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }[] = [];
    if (!isFirst) buttons.push({ text: 'Move up', onPress: () => actions.onMove(-1) });
    if (!isLast) buttons.push({ text: 'Move down', onPress: () => actions.onMove(1) });
    if (!isLast)
      buttons.push({
        text: linkedToNext ? 'Unlink superset from next' : 'Superset with next',
        onPress: actions.onToggleSuperset,
      });
    buttons.push({
      text: 'Remove exercise',
      style: 'destructive',
      onPress: async () => {
        if (
          !sets.length ||
          (await confirm(`Remove ${exercise.name}?`, `This deletes the ${sets.length} logged set(s).`, {
            confirmText: 'Remove',
            destructive: true,
          }))
        )
          actions.onRemove();
      },
    });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(exercise.name, undefined, buttons);
  }

  function setMenu(s: LoggedSet) {
    Alert.alert(`Set ${s.position + 1}: ${formatSet(exercise.logType, s, unit)}`, undefined, [
      { text: 'Warm-up', onPress: () => actions.onSetType(s, 'warmup') },
      { text: 'Working', onPress: () => actions.onSetType(s, 'working') },
      { text: 'To failure', onPress: () => actions.onSetType(s, 'failure') },
      { text: 'Delete set', style: 'destructive', onPress: () => actions.onDeleteSet(s) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const prs = prSetIds(exercise.logType, sets, previousBest);
  const initial = suggestNextSet(exercise.logType, sets, last?.sets ?? []);
  let working = 0;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: p.surface },
        grouped && { borderLeftWidth: 4, borderLeftColor: p.accent },
        linkedToNext && styles.linkedBelow,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }}>
        <View style={{ flex: 1 }}>
          {grouped && <T variant="caption" style={{ color: p.accent, fontWeight: '700' }}>SUPERSET</T>}
          <T variant="heading">{exercise.name}</T>
          <T variant="caption">
            {last
              ? `Last time (${new Date(last.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}): ${last.sets
                  .filter((s) => s.setType !== 'warmup')
                  .map((s) => formatSet(exercise.logType, s, unit))
                  .join(', ')}`
              : 'First time logging this'}
          </T>
        </View>
        <Pressable accessibilityLabel={`Options for ${exercise.name}`} onPress={menu} hitSlop={12}>
          <Text style={{ color: p.textSecondary, fontSize: 22, fontWeight: '700' }}>•••</Text>
        </Pressable>
      </View>

      {sets.map((s) => {
        if (s.setType !== 'warmup') working++;
        return (
          <Pressable key={s.id} onPress={() => setMenu(s)} style={[styles.setRow, { borderColor: p.border }]}>
            <Text style={[styles.setIndex, { color: s.setType === 'warmup' ? p.textSecondary : p.accent }]}>
              {s.setType === 'warmup' ? 'W' : working}
            </Text>
            <Text style={[styles.setValue, { color: p.text }]}>{formatSet(exercise.logType, s, unit)}</Text>
            {prs.has(s.id) && (
              <Text style={[styles.pr, { color: p.onAccent, backgroundColor: p.accent }]} accessibilityLabel="Personal record">
                PR
              </Text>
            )}
            {s.setType === 'failure' && <Text style={{ color: p.danger, fontWeight: '700' }}>{SET_TYPE_LABEL.failure}</Text>}
          </Pressable>
        );
      })}

      <SetEntry key={`${sets.length}-${unit}`} logType={exercise.logType} initial={initial} unit={unit} onLog={actions.onLog} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.xs },
  linkedBelow: { marginBottom: -Spacing.md + 2, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  setIndex: { width: 20, fontWeight: '800', fontSize: 15 },
  pr: { fontSize: 12, fontWeight: '800', borderRadius: 4, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2 },
  setValue: { flex: 1, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
