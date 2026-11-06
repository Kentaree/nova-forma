import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatDuration } from '@/domain/format';
import { useDb } from '@/hooks/use-db';
import { useNow } from '@/hooks/use-now';
import { useQuery } from '@/hooks/use-query';
import { getActiveSession, startSession, type Session } from '@/repo/sessions';

export default function WorkoutScreen() {
  const db = useDb();
  const { data: active } = useQuery(() => getActiveSession(db));

  async function start() {
    const s = await startSession(db, randomUUID());
    router.push({ pathname: '/session/[id]', params: { id: s.id } });
  }

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
          <T variant="title">Workout</T>
          {active === undefined ? null : active ? (
            <ActiveCard session={active} />
          ) : (
            <Card>
              <T variant="heading">Ready when you are</T>
              <T variant="secondary">Start a session and add exercises as you go. Templates are coming next.</T>
              <Button label="Start empty workout" onPress={start} />
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function ActiveCard({ session }: { session: Session }) {
  const now = useNow(1000);
  return (
    <Card>
      <T variant="caption">IN PROGRESS · {formatDuration((now - Date.parse(session.startedAt)) / 1000)}</T>
      <T variant="heading">{session.name}</T>
      <Button label="Resume workout" onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })} />
    </Card>
  );
}
