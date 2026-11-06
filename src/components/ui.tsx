import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type TextProps, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

export function Screen({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  const p = usePalette();
  return <View style={[{ flex: 1, backgroundColor: p.background }, style]}>{children}</View>;
}

type Variant = 'title' | 'heading' | 'body' | 'secondary' | 'caption';

export function T({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  const p = usePalette();
  const color = variant === 'secondary' || variant === 'caption' ? p.textSecondary : p.text;
  return <Text {...rest} style={[styles[variant], { color }, style]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const p = usePalette();
  return <View style={[styles.card, { backgroundColor: p.surface }, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const p = usePalette();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? p.accent : p.surfaceRaised, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
      ]}>
      <Text style={[styles.buttonLabel, { color: primary ? p.onAccent : p.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? p.accent : p.surface, borderColor: selected ? p.accent : p.border },
      ]}>
      <Text style={{ color: selected ? p.onAccent : p.text, fontSize: 14, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

/** A row of mutually exclusive options, e.g. kg / lb. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16 },
  secondary: { fontSize: 15 },
  caption: { fontSize: 13 },
  card: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  button: { borderRadius: Radius.md, paddingVertical: 14, paddingHorizontal: Spacing.xl, alignItems: 'center' },
  buttonLabel: { fontSize: 17, fontWeight: '700' },
  chip: { borderRadius: Radius.pill, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 14 },
});
