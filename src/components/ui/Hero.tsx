/**
 * Page header for the main screens. Clean & airy: the header is the page
 * itself (large dark title on the canvas, a muted line under it, quiet round
 * icon buttons on the right) with a hairline under it once there is content.
 * `overlap` (a search bar, a stats card…) sits right under the title row.
 */
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesktop } from '@/hooks/useDesktop';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Props = {
  title?: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  /** Sits under the title row (search field, summary card). */
  overlap?: ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  /** Rendered above the title row (e.g. the account pill). */
  top?: ReactNode;
};

export function Hero({ title, subtitle, left, right, children, overlap, style, compact, top }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.background,
          paddingTop: (desktop ? 20 : insets.top) + (compact ? 6 : 12),
          paddingBottom: compact ? 10 : 14,
        },
        style,
      ]}
    >
      {top ? <View style={{ marginBottom: 12 }}>{top}</View> : null}
      {title || left || right ? (
        <View style={styles.row}>
          {left}
          <View style={{ flex: 1, minWidth: 0 }}>
            {title ? (
              <Text variant={compact ? 'h1' : 'display'} numberOfLines={1} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      {children ? <View style={{ marginTop: 14 }}>{children}</View> : null}
      {overlap ? <View style={{ marginTop: 14 }}>{overlap}</View> : null}
    </View>
  );
}

/**
 * Round icon button for page headers. Icons are recoloured to the text colour,
 * so callers can pass any icon (older screens pass white ones).
 */
export function HeroButton({
  children,
  onPress,
  label,
  active,
}: {
  children: ReactNode;
  onPress?: () => void;
  /** What it does, for screen readers (it shows only an icon). */ label?: string;
  /** Highlighted (e.g. a filter is on). */
  active?: boolean;
}) {
  const { colors } = useTheme();
  const fg = active ? colors.primary : colors.text;
  const tinted = Children.map(children, (c) => (isValidElement(c) ? cloneElement(c as ReactElement<{ color?: string }>, { color: fg }) : c));
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.heroBtn,
        {
          backgroundColor: active ? colors.primarySoft : pressed || hovered ? colors.surfacePressed : colors.surfaceAlt,
        },
      ]}
    >
      {tinted}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
