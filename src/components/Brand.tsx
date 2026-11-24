import { View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { env } from '@/config/env';
import { useTheme } from '@/theme/ThemeProvider';

/** EXPO_PUBLIC_APP_NAME in .env. */
export const APP_NAME = env.appName;
/**
 * The word shown after the wordmark image (which reads "Followups"): the rest of the
 * app name, e.g. "CRM" for "Followups CRM".
 */
export const PRODUCT_WORD = env.appName.split(/\s+/).slice(1).join(' ') || env.appName;

const MARK = require('../../assets/brand/mark.png');
const WORDMARK = require('../../assets/brand/wordmark.png');
const WORDMARK_WHITE = require('../../assets/brand/wordmark-white.png');
/** The wordmark image's width ÷ height (the app tile + "Followups"). */
const WORDMARK_RATIO = 1480 / 275;

/** The app mark: the follow-up chat bubble with a check, white on the brand blue (the app icon). */
export function BrandMark({ size = 64 }: { size?: number }) {
  return <Image source={MARK} style={{ width: size, height: size, borderRadius: size * 0.22 }} contentFit="cover" accessibilityLabel={APP_NAME} />;
}

/** Wordmark ("Followups", with the tile) + "CRM". `light` uses white (for use on dark or brand-blue backgrounds). */
export function BrandLogo({ height = 44, light = false }: { height?: number; light?: boolean }) {
  const { colors } = useTheme();
  const wordHeight = height * 0.62;
  return (
    <View accessibilityRole="header" accessibilityLabel={APP_NAME} style={{ gap: height * 0.08 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: height * 0.14 }}>
        <Image source={light ? WORDMARK_WHITE : WORDMARK} style={{ width: wordHeight * WORDMARK_RATIO, height: wordHeight }} contentFit="contain" />
        <Text
          style={{
            color: light ? 'rgba(255,255,255,0.85)' : colors.primary,
            fontSize: height * 0.36,
            lineHeight: height * 0.42,
            fontWeight: '700',
          }}
        >
          {PRODUCT_WORD}
        </Text>
      </View>
      <Text
        style={{
          color: light ? 'rgba(255,255,255,0.7)' : colors.textMuted,
          fontSize: height * 0.2,
          fontWeight: '600',
          letterSpacing: height * 0.04,
        }}
      >
        LEADS · WHATSAPP · FOLLOW-UPS
      </Text>
    </View>
  );
}
