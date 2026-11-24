/** A tappable row with a checkbox, for pick-what-to-sync lists. */
import { Check } from 'lucide-react-native';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

function SelectRowInner({
  on,
  title,
  subtitle,
  meta,
  badge,
  onToggle,
  right,
  noCheck,
}: {
  on: boolean;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: string;
  onToggle?: () => void;
  /** An action at the end of the row (Skip, Restore…). */
  right?: ReactNode;
  /** A plain row: no checkbox (lists where nothing is picked). */
  noCheck?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      disabled={!onToggle}
      accessibilityRole={noCheck ? undefined : 'checkbox'}
      accessibilityState={noCheck ? undefined : { checked: on }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
    >
      {noCheck ? null : (
        <View style={[styles.box, { borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primary : 'transparent' }]}>
          {on ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
        </View>
      )}
      <Avatar name={title} size={36} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1} tone={on ? 'default' : 'muted'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.successSoft }]}>
          <Text variant="micro" style={{ color: colors.success, letterSpacing: 0 }}>
            {badge}
          </Text>
        </View>
      ) : null}
      {meta ? (
        <Text variant="caption" tone="faint">
          {meta}
        </Text>
      ) : null}
      {right}
    </Pressable>
  );
}

export const SelectRow = memo(SelectRowInner);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
});
