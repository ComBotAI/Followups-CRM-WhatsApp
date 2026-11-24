import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import { Text } from './Text';

export type InputProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  left?: ReactNode;
  right?: ReactNode;
};

/** Outlined input; the border turns brand-coloured with a soft ring on focus. */
export function Input({ label, hint, error, left, right, style, onFocus, onBlur, ...rest }: InputProps) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? colors.danger : focused ? colors.primary : colors.borderStrong;
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="caption" style={[styles.label, { color: colors.textMuted }]}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: border,
            borderRadius: radius.md,
          },
          // A soft outer ring on focus.
          focused && !error ? { boxShadow: `0 0 0 3px ${colors.primarySoft}` } : null,
        ]}
      >
        {left}
        <TextInput
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { color: colors.text, fontFamily: fonts.regular }, style]}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontWeight: '500' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 46,
    gap: 10,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 12 },
});
