import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';

import { ExercisePicker } from '@/components/exercise-picker';
import { useDb } from '@/hooks/use-db';
import { addExerciseToTemplate } from '@/repo/templates';

export default function AddExerciseToTemplate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  return (
    <ExercisePicker
      onPick={async (exerciseId) => {
        await addExerciseToTemplate(db, id, exerciseId, randomUUID());
        router.back();
      }}
    />
  );
}
