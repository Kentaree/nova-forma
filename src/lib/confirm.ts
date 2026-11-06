import { Alert, Platform } from 'react-native';

/** Yes/no prompt. Uses the native alert on phones, and window.confirm in the web preview. */
export function confirm(
  title: string,
  message: string,
  opts: { confirmText: string; cancelText?: string; destructive?: boolean },
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: opts.cancelText ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: opts.confirmText, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}
