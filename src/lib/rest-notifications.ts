import * as Notifications from 'expo-notifications';

/**
 * A local notification for when rest ends, so the alert still arrives with the phone
 * locked or the app in the background. In the foreground the app plays haptics itself,
 * so the banner is suppressed and only the sound plays.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let permission: Promise<boolean> | null = null;

function ensurePermission(): Promise<boolean> {
  permission ??= Notifications.requestPermissionsAsync()
    .then((r) => r.granted)
    .catch(() => false);
  return permission;
}

export async function scheduleRestDone(seconds: number): Promise<string | null> {
  if (seconds < 1 || !(await ensurePermission())) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: 'Rest over', body: 'Time for your next set.', sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(seconds) },
    });
  } catch {
    return null;
  }
}

export async function cancelRestDone(id: string | null): Promise<void> {
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
}
