import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';

import { ExercisePicker } from '@/components/exercise-picker';
import { useDb } from '@/hooks/use-db';
import { addExerciseToSession } from '@/repo/sessions';

export default function AddExerciseToSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  return (
    <ExercisePicker
      onPick={async (exerciseId) => {
        await addExerciseToSession(db, id, exerciseId, randomUUID());
        router.back();
      }}
    />
  );
}
