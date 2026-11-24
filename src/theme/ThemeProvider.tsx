import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { shade } from '@/lib/color';
import { useAccountsStore } from '@/stores/accounts';
import { useSettingsStore } from '@/stores/settings';
import { buildColors, radius, shadow, spacing, typography, type Colors, type ColorScheme } from './tokens';

export type Theme = {
  colors: Colors;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof typography;
  shadow: typeof shadow;
  scheme: ColorScheme;
};

const ThemeContext = createContext<Theme | null>(null);

/**
 * An account colour replaces the green for actions and highlights only. The
 * canvas, surfaces and headers stay neutral (clean & airy): colour means
 * "you can act on this", not decoration.
 */
const themed = (base: Colors, scheme: ColorScheme, accent?: string): Colors => {
  if (!accent) return base;
  const dark = scheme === 'dark';
  return {
    ...base,
    primary: dark ? shade(accent, -0.28) : accent,
    primaryStrong: dark ? accent : shade(accent, 0.18),
    primarySoft: dark ? shade(accent, 0.78) : shade(accent, -0.92),
  };
};

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const preference = useSettingsStore((s) => s.theme);
  const scheme: ColorScheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  // Each account's colour is its theme: buttons, highlights, tabs and header follow it.
  const accent = useAccountsStore((s) => s.sessions.find((x) => x.id === s.activeId)?.color);
  const value = useMemo<Theme>(
    () => ({
      colors: themed(buildColors(scheme), scheme, accent),
      spacing,
      radius,
      type: typography,
      shadow,
      scheme,
    }),
    [scheme, accent],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): Theme => {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
};
