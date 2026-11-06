import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Screen, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { WeightUnit } from '@/domain/types';
import { useDb } from '@/hooks/use-db';
import { useQuery } from '@/hooks/use-query';
import { getSettings, saveSettings, type Settings } from '@/repo/settings';

const REST_STEP = 15;

export default function SettingsScreen() {
  const db = useDb();
  const { data } = useQuery(() => getSettings(db));
  // Changes show immediately; the database write happens in the background.
  const [edits, setEdits] = useState<Partial<Settings>>({});
  const settings: Settings | undefined = data && { ...data, ...edits };

  function update(patch: Partial<Settings>) {
    setEdits((e) => ({ ...e, ...patch }));
    saveSettings(db, patch);
  }

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
          <T variant="title">Settings</T>
          {settings && (
            <>
              <Card>
                <T variant="heading">Weight unit</T>
                <Segmented<WeightUnit>
                  options={[
                    { value: 'kg', label: 'Kilograms' },
                    { value: 'lb', label: 'Pounds' },
                  ]}
                  value={settings.weightUnit}
                  onChange={(weightUnit) => update({ weightUnit })}
                />
              </Card>
              <Card>
                <T variant="heading">Default rest</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.lg }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      kind="secondary"
                      label={`−${REST_STEP}s`}
                      disabled={settings.defaultRestSeconds <= REST_STEP}
                      onPress={() => update({ defaultRestSeconds: settings.defaultRestSeconds - REST_STEP })}
                    />
                  </View>
                  <T variant="heading" style={{ minWidth: 64, textAlign: 'center' }}>
                    {formatRest(settings.defaultRestSeconds)}
                  </T>
                  <View style={{ flex: 1 }}>
                    <Button
                      kind="secondary"
                      label={`+${REST_STEP}s`}
                      onPress={() => update({ defaultRestSeconds: settings.defaultRestSeconds + REST_STEP })}
                    />
                  </View>
                </View>
              </Card>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function formatRest(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
