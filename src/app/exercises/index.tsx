import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';

import { Chip, Screen, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { LOG_TYPE_LABELS, titleCase } from '@/domain/labels';
import { useDb } from '@/hooks/use-db';
import { usePalette } from '@/hooks/use-palette';
import { useQuery } from '@/hooks/use-query';
import { listExercises, listMuscles } from '@/repo/exercises';

export default function ExerciseLibrary() {
  const db = useDb();
  const p = usePalette();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<string | undefined>();
  const { data: muscles } = useQuery(() => listMuscles(db));
  const { data: exercises } = useQuery(() => listExercises(db, { search, muscle }));

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/exercises/new" asChild>
              <Pressable accessibilityLabel="Add custom exercise" hitSlop={12}>
                <T style={{ color: p.accent, fontSize: 28, lineHeight: 30 }}>+</T>
              </Pressable>
            </Link>
          ),
        }}
      />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        data={exercises ?? []}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={
          <View style={{ gap: Spacing.md, paddingBottom: Spacing.sm }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search exercises"
              placeholderTextColor={p.textSecondary}
              autoCorrect={false}
              clearButtonMode="while-editing"
              style={{
                backgroundColor: p.surface,
                color: p.text,
                borderRadius: Radius.md,
                paddingHorizontal: Spacing.md,
                paddingVertical: 10,
                fontSize: 16,
              }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
              <Chip label="All" selected={!muscle} onPress={() => setMuscle(undefined)} />
              {(muscles ?? []).map((m) => (
                <Chip key={m} label={titleCase(m)} selected={muscle === m} onPress={() => setMuscle(m === muscle ? undefined : m)} />
              ))}
            </ScrollView>
          </View>
        }
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}
        ListEmptyComponent={
          exercises ? <T variant="secondary">No exercises match. Tap + to add your own.</T> : undefined
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: '/exercises/[id]', params: { id: item.id } }} asChild>
            <Pressable
              style={({ pressed }) => ({
                backgroundColor: p.surface,
                borderRadius: Radius.md,
                padding: Spacing.md,
                opacity: pressed ? 0.7 : 1,
                gap: 2,
              })}>
              <T style={{ fontWeight: '600' }}>{item.name}</T>
              <T variant="caption">
                {item.primaryMuscles.map(titleCase).join(', ')} · {LOG_TYPE_LABELS[item.logType]}
                {item.isCustom ? ' · Custom' : ''}
              </T>
            </Pressable>
          </Link>
        )}
      />
    </Screen>
  );
}
