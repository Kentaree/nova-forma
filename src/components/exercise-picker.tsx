import { useState } from 'react';
import { FlatList, Pressable, TextInput } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { titleCase } from '@/domain/labels';
import { useDb } from '@/hooks/use-db';
import { usePalette } from '@/hooks/use-palette';
import { useQuery } from '@/hooks/use-query';
import { listExercises } from '@/repo/exercises';

import { Screen, T } from './ui';

/** Searchable exercise list used when adding to a workout or a template. */
export function ExercisePicker({ onPick }: { onPick: (exerciseId: string) => void }) {
  const db = useDb();
  const p = usePalette();
  const [search, setSearch] = useState('');
  const { data } = useQuery(() => listExercises(db, { search }), search);

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
            onPress={() => onPick(item.id)}
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
