import { NativeTabs } from 'expo-router/native-tabs';

import { usePalette } from '@/hooks/use-palette';

export default function AppTabs() {
  const p = usePalette();
  return (
    <NativeTabs
      backgroundColor={p.surface}
      tintColor={p.accent}
      iconColor={{ default: p.textSecondary, selected: p.accent }}
      indicatorColor={p.surfaceRaised}
      labelStyle={{ default: { color: p.textSecondary }, selected: { color: p.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Workout</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="dumbbell.fill" md="fitness_center" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="exercises">
        <NativeTabs.Trigger.Label>Exercises</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet" md="list" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
