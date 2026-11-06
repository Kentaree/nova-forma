import { Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

/**
 * Minimal bar chart of one value per session (oldest → newest). Deliberately dependency-free;
 * the latest bar is highlighted so progress reads at a glance.
 */
export function ProgressChart({ points, format }: { points: { label: string; value: number }[]; format: (v: number) => string }) {
  const p = usePalette();
  if (points.length < 2) return null;
  const max = Math.max(...points.map((x) => x.value));
  const min = Math.min(...points.map((x) => x.value));
  const floor = Math.max(0, min - (max - min) * 0.5); // zoom in so small gains are visible
  const height = 120;

  return (
    <View style={{ gap: Spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 4 }}>
        {points.map((pt, i) => {
          const h = max === floor ? height : 12 + ((pt.value - floor) / (max - floor)) * (height - 12);
          const latest = i === points.length - 1;
          return (
            <View
              key={i}
              accessibilityLabel={`${pt.label}: ${format(pt.value)}`}
              style={{ flex: 1, height: h, borderRadius: 4, backgroundColor: latest ? p.accent : p.surfaceRaised }}
            />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: p.textSecondary, fontSize: 12 }}>{points[0].label}</Text>
        <Text style={{ color: p.textSecondary, fontSize: 12 }}>
          {points.at(-1)!.label} · {format(points.at(-1)!.value)}
        </Text>
      </View>
    </View>
  );
}
