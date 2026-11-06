import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

/**
 * Big −/+ buttons around an editable value: tap the buttons between sets, or type a value.
 * `format`/`parse` let it edit things like durations ("1:30").
 */
export function Stepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  format = (v) => String(v),
  parse = (t) => (t.trim() === '' || isNaN(Number(t)) ? null : Number(t)),
  keyboardType = 'decimal-pad',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  format?: (v: number) => string;
  parse?: (text: string) => number | null;
  keyboardType?: 'decimal-pad' | 'number-pad' | 'numbers-and-punctuation';
}) {
  const p = usePalette();
  const [draft, setDraft] = useState<string | null>(null);

  const bump = (d: number) => onChange(Math.max(min, Math.round((value + d) * 1000) / 1000));
  const commit = () => {
    if (draft !== null) {
      const v = parse(draft);
      if (v !== null) onChange(Math.max(min, v));
      setDraft(null);
    }
  };

  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ color: p.textSecondary, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{label}</Text>
      <View style={[styles.row, { backgroundColor: p.surfaceRaised }]}>
        <Pressable
          accessibilityLabel={`Decrease ${label}`}
          onPress={() => bump(-step)}
          style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.5 : 1 }]}>
          <Text style={[styles.btnText, { color: p.text }]}>−</Text>
        </Pressable>
        <TextInput
          accessibilityLabel={label}
          value={draft ?? format(value)}
          onFocus={() => setDraft(format(value))}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          selectTextOnFocus
          keyboardType={keyboardType}
          returnKeyType="done"
          style={[styles.input, { color: p.text }]}
        />
        <Pressable
          accessibilityLabel={`Increase ${label}`}
          onPress={() => bump(step)}
          style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.5 : 1 }]}>
          <Text style={[styles.btnText, { color: p.text }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.md },
  btn: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 26, fontWeight: '500' },
  input: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 22, fontWeight: '700', paddingVertical: Spacing.sm, fontVariant: ['tabular-nums'] },
});
