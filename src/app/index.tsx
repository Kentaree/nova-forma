import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';

export default function WorkoutScreen() {
  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
          <T variant="title">Workout</T>
          <Card>
            <T variant="heading">Ready when you are</T>
            <T variant="secondary">
              Session logging is the next piece being built: start a workout, log sets in a tap or two, and see what
              you lifted last time.
            </T>
            <Button label="Start empty workout" onPress={() => {}} disabled />
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}
