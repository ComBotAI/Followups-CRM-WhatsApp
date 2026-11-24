import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'whatsapp' | 'outline' | 'light';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  title?: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  children?: ReactNode;
};

/** Rounded-rect button: solid primary, quiet filled secondary, bordered outline, text ghost. */
export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  iconRight,
  full,
  style,
  haptic = true,
  disabled,
  onPress,
  children,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    secondary: { bg: colors.surfaceAlt, fg: colors.text },
    ghost: { bg: 'transparent', fg: colors.primary },
    outline: { bg: colors.surface, fg: colors.text, border: colors.border },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    success: { bg: colors.success, fg: '#fff' },
    whatsapp: { bg: '#1FAF55', fg: '#fff' },
    light: { bg: colors.heroGlass, fg: colors.onHero },
  };
  const p = palette[variant];
  const height = { sm: 34, md: 44, lg: 50 }[size];
  const isDisabled = disabled || loading;
  const content = loading ? (
    <ActivityIndicator color={p.fg} />
  ) : (
    <View style={styles.row}>
      {icon}
      {title ? (
        <Text variant={size === 'sm' ? 'caption' : 'bodyStrong'} style={{ color: p.fg, fontWeight: '600' }} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      {children}
      {iconRight}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={(e) => {
        if (haptic) void Haptics.selectionAsync();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        // Full-size buttons span their container (footers, forms, cards); small ones hug their label.
        { alignSelf: size === 'sm' ? 'flex-start' : 'stretch' },
        {
          height,
          borderRadius: size === 'sm' ? 8 : 10,
          opacity: isDisabled ? 0.45 : 1,
          backgroundColor: variant === 'primary' && pressed ? colors.primaryStrong : pressed && variant !== 'whatsapp' ? colors.surfacePressed : p.bg,
          borderWidth: p.border ? 1 : 0,
          borderColor: p.border,
          paddingHorizontal: size === 'sm' ? 12 : 16,
        },
        full && { alignSelf: 'stretch' },
        style,
      ]}
      {...rest}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
