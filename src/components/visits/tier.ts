/** Colour of a guest tier: VIP stands out, Regular is the brand colour, New is quiet. */
import { useTheme } from '@/theme/ThemeProvider';

export const useTierColor = () => {
  const { colors } = useTheme();
  return (tier: string) => (tier === 'VIP' ? colors.warning : tier === 'Regular' ? colors.primary : colors.textMuted);
};
