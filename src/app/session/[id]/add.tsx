import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, TextInput } from 'react-native';

import { Screen, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { titleCase } from '@/domain/labels';
import { useDb } from '@/hooks/use-db';
import { usePalette } from '@/hooks/use-palette';
import { useQuery } from '@/hooks/use-query';
import { listExercises } from '@/repo/exercises';
import { addExerciseToSession } from '@/repo/sessions';

export default function AddExercise() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const p = usePalette();
  const [search, setSearch] = useState('');
  const { data } = useQuery(() => listExercises(db, { search }), search);

  async function pick(exerciseId: string) {
    await addExerciseToSession(db, id, exerciseId, randomUUID());
    router.back();
  }

  return (
    <Screen>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        data={data ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}
        ListHeaderComponent={
          <TextInput
            autoFocus
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises"
            placeholderTextColor={p.textSecondary}
            autoCorrect={false}
            style={{
              backgroundColor: p.surface,
              color: p.text,
              borderRadius: Radius.md,
              paddingHorizontal: Spacing.md,
              paddingVertical: 10,
              fontSize: 16,
              marginBottom: Spacing.sm,
            }}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => pick(item.id)}
            style={({ pressed }) => ({
              backgroundColor: p.surface,
              borderRadius: Radius.md,
              padding: Spacing.md,
              opacity: pressed ? 0.7 : 1,
            })}>
            <T style={{ fontWeight: '600' }}>{item.name}</T>
            <T variant="caption">{item.primaryMuscles.map(titleCase).join(', ')}</T>
          </Pressable>
        )}
      />
    </Screen>
  );
}
