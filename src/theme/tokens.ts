/**
 * Design tokens. One source of truth for colour, spacing, radius and type so
 * every screen reads as one product. Semantic names only: components never
 * reach for a raw hex.
 */

export type ColorScheme = 'light' | 'dark';

export const buildColors = (scheme: ColorScheme) => {
  const dark = scheme === 'dark';
  return {
    scheme,
    /** App canvas. Light: pure white, the "clean & airy" base; structure comes from hairlines, not fills. */
    background: dark ? '#0B0D12' : '#FFFFFF',
    /** Cards, sheets, inputs. Same as the canvas in light mode: cards are outlined, not lifted. */
    surface: dark ? '#12151C' : '#FFFFFF',
    /** Inset fill: inputs, chips, secondary buttons, icon wells. Cool neutral. */
    surfaceAlt: dark ? '#181C25' : '#F5F7FA',
    /** Pressed / hover fill. */
    surfacePressed: dark ? '#20252F' : '#EDF0F5',
    border: dark ? '#1F2430' : '#EBEEF3',
    borderStrong: dark ? '#2F3542' : '#D7DCE4',
    text: dark ? '#EEF1F6' : '#0C111C',
    textMuted: dark ? '#9AA3B2' : '#5A6372',
    textFaint: dark ? '#687183' : '#98A1AF',
    /** Followups CRM blue (logo #2F5BEA), deepened on light backgrounds so white text on it stays readable. */
    primary: dark ? '#5B82FF' : '#2450DB',
    primaryStrong: dark ? '#3D68F5' : '#1C3FB0',
    primarySoft: dark ? '#141D3A' : '#EEF2FE',
    onPrimary: '#FFFFFF',
    success: dark ? '#4ADE80' : '#15803D',
    successSoft: dark ? '#0F2A18' : '#EAF7EE',
    warning: dark ? '#FBBF24' : '#B45309',
    warningSoft: dark ? '#2E2208' : '#FEF5E6',
    danger: dark ? '#F87171' : '#DC2626',
    dangerSoft: dark ? '#331414' : '#FDEEEE',
    accent: dark ? '#A78BFA' : '#6D28D9',
    accentSoft: dark ? '#221A3A' : '#F3EFFD',
    whatsapp: '#25D366',
    whatsappSoft: dark ? '#0D2A20' : '#E8F8EE',
    sms: dark ? '#38BDF8' : '#0369A1',
    smsSoft: dark ? '#0B2533' : '#E8F4FB',
    overlay: dark ? 'rgba(0,0,0,0.6)' : 'rgba(12,17,28,0.32)',
    skeleton: dark ? '#1A1E27' : '#F0F2F6',
    tabBar: dark ? '#0F1218' : '#FFFFFF',
    /**
     * Page headers. Clean & airy: the header is the canvas itself (dark type on
     * white), so these mirror the canvas and text roles. Kept as roles so a
     * screen can still ask for "header" colours.
     */
    heroFrom: dark ? '#0B0D12' : '#FFFFFF',
    heroTo: dark ? '#0B0D12' : '#FFFFFF',
    onHero: dark ? '#EEF1F6' : '#0C111C',
    onHeroMuted: dark ? '#9AA3B2' : '#5A6372',
    heroGlass: dark ? '#181C25' : '#F5F7FA',
  } as const;
};

type RawColors = ReturnType<typeof buildColors>;
/** Colour roles; values are plain strings so an account theme can replace them. */
export type Colors = { [K in keyof RawColors]: K extends 'scheme' ? ColorScheme : string };

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

/**
 * Inter, loaded in the root layout. Android picks the face by family name, not
 * by `fontWeight`, so `Text` maps each weight to its family.
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const fontForWeight = (w?: string | number): string => {
  const n = typeof w === 'number' ? w : w === 'bold' ? 700 : w === 'normal' || !w ? 400 : Number(w) || 400;
  return n >= 800 ? fonts.extrabold : n >= 700 ? fonts.bold : n >= 600 ? fonts.semibold : n >= 500 ? fonts.medium : fonts.regular;
};

export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.8 },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const, letterSpacing: -0.6 },
  h2: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.3 },
  h3: { fontSize: 15.5, lineHeight: 21, fontWeight: '600' as const, letterSpacing: -0.15 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const, letterSpacing: -0.1 },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '500' as const, letterSpacing: -0.1 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 0.3 },
  mono: { fontSize: 15, lineHeight: 20, fontWeight: '500' as const, fontVariant: ['tabular-nums'] as const },
} as const;

export const shadow = {
  /** Barely there: outlined cards carry structure, the shadow only separates them from the canvas. */
  card: {
    shadowColor: '#0C1210',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 0,
  },
  /** Menus, sheets, floating buttons. */
  floating: {
    shadowColor: '#0C1210',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;

/** Stable colour for an avatar / tag from any string. */
const hashHue = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
};

export const avatarColors = (seed: string, scheme: ColorScheme) => {
  const hue = hashHue(seed);
  return scheme === 'dark' ? { bg: `hsl(${hue} 30% 20%)`, fg: `hsl(${hue} 70% 78%)` } : { bg: `hsl(${hue} 60% 94%)`, fg: `hsl(${hue} 45% 36%)` };
};
