import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatDuration, parseDuration, trimNumber } from '@/domain/format';
import type { LogType, SetType, SetValues, WeightUnit } from '@/domain/types';
import { fromKg, toKg } from '@/domain/units';

import { Stepper } from './stepper';
import { Button, Chip } from './ui';

/**
 * The input row under an exercise. It's keyed by the number of sets logged, so it
 * re-mounts (and re-reads `initial`) after every logged set.
 */
export function SetEntry({
  logType,
  initial,
  unit,
  onLog,
}: {
  logType: LogType;
  initial: SetValues;
  unit: WeightUnit;
  onLog: (v: SetValues & { setType: SetType }) => void;
}) {
  // Weight is edited in the display unit and converted back to kg on log.
  const [weight, setWeight] = useState(() =>
    initial.weightKg == null ? 0 : Number(trimNumber(fromKg(initial.weightKg, unit), 2)),
  );
  const [reps, setReps] = useState(initial.reps ?? 0);
  const [duration, setDuration] = useState(initial.durationS ?? 0);
  const [distanceKm, setDistanceKm] = useState(initial.distanceM == null ? 0 : initial.distanceM / 1000);
  const [warmup, setWarmup] = useState(false);

  const weightStep = unit === 'kg' ? 2.5 : 5;
  const durationProps = {
    format: formatDuration,
    parse: parseDuration,
    keyboardType: 'numbers-and-punctuation' as const,
  };

  function log() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const v: SetValues = { weightKg: null, reps: null, durationS: null, distanceM: null };
    if (logType === 'weight_reps') Object.assign(v, { weightKg: toKg(weight, unit), reps });
    if (logType === 'reps') Object.assign(v, { reps, weightKg: weight ? toKg(weight, unit) : null });
    if (logType === 'time') v.durationS = duration;
    if (logType === 'cardio') Object.assign(v, { durationS: duration || null, distanceM: distanceKm ? distanceKm * 1000 : null });
    onLog({ ...v, setType: warmup ? 'warmup' : 'working' });
  }

  const canLog =
    (logType === 'weight_reps' && reps > 0) ||
    (logType === 'reps' && reps > 0) ||
    (logType === 'time' && duration > 0) ||
    (logType === 'cardio' && (duration > 0 || distanceKm > 0));

  return (
    <View style={{ gap: Spacing.md, marginTop: Spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: Spacing.md }}>
        {logType === 'weight_reps' && (
          <>
            <Stepper label={unit.toUpperCase()} value={weight} onChange={setWeight} step={weightStep} />
            <Stepper label="REPS" value={reps} onChange={setReps} step={1} keyboardType="number-pad" />
          </>
        )}
        {logType === 'reps' && (
          <>
            <Stepper label="REPS" value={reps} onChange={setReps} step={1} keyboardType="number-pad" />
            <Stepper label={`+${unit.toUpperCase()}`} value={weight} onChange={setWeight} step={weightStep} />
          </>
        )}
        {logType === 'time' && <Stepper label="TIME" value={duration} onChange={setDuration} step={5} {...durationProps} />}
        {logType === 'cardio' && (
          <>
            <Stepper label="KM" value={distanceKm} onChange={setDistanceKm} step={0.1} />
            <Stepper label="TIME" value={duration} onChange={setDuration} step={60} {...durationProps} />
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'center' }}>
        {logType !== 'cardio' && <Chip label="Warm-up" selected={warmup} onPress={() => setWarmup((w) => !w)} />}
        <View style={{ flex: 1 }}>
          <Button label="Log set" onPress={log} disabled={!canLog} />
        </View>
      </View>
    </View>
  );
}
