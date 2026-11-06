import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { Button, Chip, Screen, Segmented, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { LOG_TYPE_LABELS, titleCase } from '@/domain/labels';
import type { LogType } from '@/domain/types';
import { useDb } from '@/hooks/use-db';
import { usePalette } from '@/hooks/use-palette';
import { useQuery } from '@/hooks/use-query';
import { createCustomExercise, listMuscles } from '@/repo/exercises';

const LOG_TYPES = (Object.keys(LOG_TYPE_LABELS) as LogType[]).map((value) => ({ value, label: LOG_TYPE_LABELS[value] }));

export default function NewExercise() {
  const db = useDb();
  const p = usePalette();
  const { data: muscles } = useQuery(() => listMuscles(db));
  const [name, setName] = useState('');
  const [logType, setLogType] = useState<LogType>('weight_reps');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const ex = await createCustomExercise(db, { name, logType, primaryMuscles: selected }, randomUUID());
      router.dismiss();
      router.push({ pathname: '/exercises/[id]', params: { id: ex.id } });
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.xl }}>
        <View style={{ gap: Spacing.sm }}>
          <T variant="heading">Name</T>
          <TextInput
            autoFocus
            value={name}
            onChangeText={(t) => (setName(t), setError(null))}
            placeholder="e.g. Belt Squat"
            placeholderTextColor={p.textSecondary}
            style={{ backgroundColor: p.surface, color: p.text, borderRadius: Radius.md, padding: Spacing.md, fontSize: 16 }}
          />
        </View>
        <View style={{ gap: Spacing.sm }}>
          <T variant="heading">How you log it</T>
          <Segmented options={LOG_TYPES} value={logType} onChange={setLogType} />
        </View>
        <View style={{ gap: Spacing.sm }}>
          <T variant="heading">Primary muscles</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
            {(muscles ?? []).map((m) => (
              <Chip
                key={m}
                label={titleCase(m)}
                selected={selected.includes(m)}
                onPress={() => setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]))}
              />
            ))}
          </View>
        </View>
        {error && <T style={{ color: p.danger }}>{error}</T>}
        <Button label="Save exercise" onPress={save} disabled={saving || !name.trim()} />
      </ScrollView>
    </Screen>
  );
}
