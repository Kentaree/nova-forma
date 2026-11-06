import * as Haptics from 'expo-haptics';
import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { formatDuration } from '@/domain/format';
import { adjustRest, remainingSeconds, startRest, type RestTimer } from '@/domain/rest-timer';
import { usePalette } from '@/hooks/use-palette';
import { cancelRestDone, scheduleRestDone } from '@/lib/rest-notifications';

interface RestTimerApi {
  timer: RestTimer | null;
  start: (seconds: number) => void;
  adjust: (deltaS: number) => void;
  stop: () => void;
}

const Ctx = createContext<RestTimerApi | null>(null);

export function useRestTimer(): RestTimerApi {
  const api = use(Ctx);
  if (!api) throw new Error('useRestTimer must be used inside RestTimerProvider');
  return api;
}

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [timer, setTimer] = useState<RestTimer | null>(null);
  const notification = useRef<string | null>(null);

  function replace(next: RestTimer | null) {
    const prev = notification.current;
    notification.current = null;
    cancelRestDone(prev);
    setTimer(next);
    if (next) {
      scheduleRestDone(remainingSeconds(next, Date.now())).then((id) => {
        notification.current = id;
      });
    }
  }

  const api: RestTimerApi = {
    timer,
    start: (seconds) => replace(startRest(seconds, Date.now())),
    adjust: (delta) => timer && replace(adjustRest(timer, delta, Date.now())),
    stop: () => replace(null),
  };

  // When the countdown hits zero in the foreground: buzz, then clear.
  useEffect(() => {
    if (!timer) return;
    const ms = Math.max(0, timer.endsAt - Date.now());
    const t = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notification.current = null; // it has fired
      setTimer(null);
    }, ms);
    return () => clearTimeout(t);
  }, [timer]);

  return <Ctx value={api}>{children}</Ctx>;
}

/** Sticky bar shown while resting. */
export function RestBar() {
  const { timer, adjust, stop } = useRestTimer();
  const p = usePalette();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [timer]);
  if (!timer) return null;

  const left = remainingSeconds(timer, now);
  const progress = 1 - left / timer.durationS;
  return (
    <View style={[styles.bar, { backgroundColor: p.surfaceRaised, borderColor: p.border }]}>
      <View style={[styles.progress, { backgroundColor: p.accent, width: `${Math.min(100, progress * 100)}%` }]} />
      <Text style={[styles.label, { color: p.textSecondary }]}>Rest</Text>
      <Text style={[styles.time, { color: p.text }]} accessibilityLiveRegion="polite">
        {formatDuration(left)}
      </Text>
      <View style={{ flex: 1 }} />
      <BarButton label="−15" onPress={() => adjust(-15)} />
      <BarButton label="+15" onPress={() => adjust(15)} />
      <BarButton label="Skip" onPress={stop} accent />
    </View>
  );
}

function BarButton({ label, onPress, accent }: { label: string; onPress: () => void; accent?: boolean }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: accent ? p.accent : p.surface, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text style={{ color: accent ? p.onAccent : p.text, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  progress: { position: 'absolute', left: 0, top: 0, height: 3 },
  label: { fontSize: 15, fontWeight: '600' },
  time: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  btn: { borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 14 },
});
