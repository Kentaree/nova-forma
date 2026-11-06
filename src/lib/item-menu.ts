import { Alert } from 'react-native';

/** The ••• menu shared by workout and template exercise cards. */
export function showItemMenu(
  title: string,
  opts: {
    isFirst: boolean;
    isLast: boolean;
    linkedToNext: boolean;
    onMove: (dir: -1 | 1) => void;
    onToggleSuperset: () => void;
    onRemove: () => void;
  },
) {
  const buttons: { text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }[] = [];
  if (!opts.isFirst) buttons.push({ text: 'Move up', onPress: () => opts.onMove(-1) });
  if (!opts.isLast) buttons.push({ text: 'Move down', onPress: () => opts.onMove(1) });
  if (!opts.isLast)
    buttons.push({
      text: opts.linkedToNext ? 'Unlink superset from next' : 'Superset with next',
      onPress: opts.onToggleSuperset,
    });
  buttons.push({ text: 'Remove exercise', style: 'destructive', onPress: opts.onRemove });
  buttons.push({ text: 'Cancel', style: 'cancel' });
  Alert.alert(title, undefined, buttons);
}
