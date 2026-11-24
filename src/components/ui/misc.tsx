import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { GradientDisc } from './kit';
import { Text } from './Text';

export function Row({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginStart: inset,
      }}
    />
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      {icon ? (
        <View style={{ marginBottom: 8 }}>
          <GradientDisc size={60}>{icon}</GradientDisc>
        </View>
      ) : null}
      <Text variant="h3" center>
        {title}
      </Text>
      {body ? (
        <Text tone="muted" center style={{ maxWidth: 280 }}>
          {body}
        </Text>
      ) : null}
      {action && onAction ? <Button title={action} onPress={onAction} style={{ marginTop: 12, alignSelf: 'center', minWidth: 200 }} /> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
      {label ? (
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8, style }: { h?: number; w?: number | `${number}%`; r?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          height: h,
          width: w,
          borderRadius: r,
          backgroundColor: colors.skeleton,
        },
        style,
      ]}
    />
  );
}

/** Round icon button used in headers and toolbars. */
export function IconButton({
  children,
  onPress,
  tone = 'neutral',
  size = 40,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  tone?: 'neutral' | 'primary' | 'danger' | 'success';
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const bg = {
    neutral: colors.surfaceAlt,
    primary: colors.primarySoft,
    danger: colors.dangerSoft,
    success: colors.successSoft,
  }[tone];
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              styles.segmentItem,
              {
                borderRadius: radius.sm,
                backgroundColor: active ? colors.surface : 'transparent',
              },
              active && styles.segmentActive,
            ]}
          >
            <Text variant="caption" tone={active ? 'default' : 'muted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 32,
  },
  segment: { flexDirection: 'row', padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  segmentActive: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
