import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';

import { RestTimerProvider } from '@/components/rest-timer';
import { Colors } from '@/constants/theme';
import { fromExpo } from '@/db/expo';
import { initDatabase } from '@/db/init';

export const DATABASE_NAME = 'nova-forma.db';

async function onInit(db: SQLiteDatabase) {
  await initDatabase(fromExpo(db));
}

export default function RootLayout() {
  const light = useColorScheme() === 'light';
  const p = light ? Colors.light : Colors.dark;
  const base = light ? DefaultTheme : DarkTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: p.accent, background: p.background, card: p.surface, text: p.text, border: p.border },
  };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={light ? 'dark' : 'light'} />
      <Suspense
        fallback={
          <View style={{ flex: 1, backgroundColor: p.background, justifyContent: 'center' }}>
            <ActivityIndicator color={p.accent} />
          </View>
        }>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={onInit} useSuspense>
          <RestTimerProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="session/[id]/index"
                options={{ title: 'Workout', presentation: 'fullScreenModal', gestureEnabled: false }}
              />
              <Stack.Screen name="session/[id]/add" options={{ title: 'Add exercise', presentation: 'modal' }} />
              <Stack.Screen name="template/[id]/index" options={{ title: 'Template' }} />
              <Stack.Screen name="template/[id]/add" options={{ title: 'Add exercise', presentation: 'modal' }} />
            </Stack>
          </RestTimerProvider>
        </SQLiteProvider>
      </Suspense>
    </ThemeProvider>
  );
}
