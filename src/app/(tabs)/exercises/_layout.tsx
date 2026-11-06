import { Stack } from 'expo-router';

export default function ExercisesLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitle: true }}>
      <Stack.Screen name="index" options={{ title: 'Exercises' }} />
      <Stack.Screen name="[id]" options={{ title: '', headerLargeTitle: false }} />
      <Stack.Screen name="new" options={{ title: 'New exercise', presentation: 'modal', headerLargeTitle: false }} />
    </Stack>
  );
}
