/**
 * The startup screen shown after the native splash while the app loads
 * (fonts, saved sign-in). It picks up exactly where the native splash leaves
 * off (the blue app tile, centred, on white or near-black), then the tile
 * hands over to the full wordmark (which carries the same tile) with
 * "CRM" and the tagline, and three soft dots breathe until the app is ready. Fades out when `visible` turns false.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { PRODUCT_WORD } from '@/components/Brand';
import { env } from '@/config/env';

/** The native splash image itself, so the hand-over is seamless. */
const MARK = require('../../assets/images/splash-icon.png');
const WORDMARK = require('../../assets/brand/wordmark.png');
const WORDMARK_WHITE = require('../../assets/brand/wordmark-white.png');
/** Image width ÷ height. */
const MARK_RATIO = 1;
const WORDMARK_RATIO = 1480 / 275;
/** Same size as the native splash (app.config.ts imageWidth 180; the image carries its own padding). */
const MARK_W = 180;
const BLUE = '#2F5BEA';

export function BootSplash({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  const dark = useColorScheme() === 'dark';
  const [fade] = useState(() => new Animated.Value(1));
  const [intro] = useState(() => new Animated.Value(0));
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0)));
  // Gone for good once faded.
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const enter = Animated.timing(intro, {
      toValue: 1,
      duration: 720,
      delay: 120,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    });
    const pulse = Animated.loop(
      Animated.stagger(
        160,
        dots.map((d) =>
          Animated.sequence([
            Animated.timing(d, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(d, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
        ),
      ),
    );
    enter.start();
    pulse.start();
    return () => {
      enter.stop();
      pulse.stop();
    };
  }, [intro, dots]);

  useEffect(() => {
    if (visible) return;
    Animated.timing(fade, { toValue: 0, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(
      ({ finished }) => finished && setGone(true),
    );
  }, [visible, fade]);

  if (gone) return null;

  // The mark shrinks away as the wordmark (which carries the same mark) rises into its place.
  const markOut = intro.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: 'clamp' });
  const markScale = intro.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0.7], extrapolate: 'clamp' });
  const textIn = intro.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0, 1] });
  const textRise = intro.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const exitScale = fade.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] });
  const muted = dark ? '#8E97A6' : '#6B7280';

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { opacity: fade, overflow: 'hidden', backgroundColor: dark ? '#0B0D12' : '#FFFFFF' }]}
    >
      <Animated.View style={[styles.center, { transform: [{ scale: exitScale }] }]}>
        <Animated.View style={{ opacity: markOut, transform: [{ scale: markScale }] }}>
          <Image source={MARK} style={{ width: MARK_W, height: MARK_W / MARK_RATIO }} contentFit="contain" />
        </Animated.View>
        <Animated.View style={[styles.words, { opacity: textIn, transform: [{ translateY: textRise }] }]}>
          <Image
            source={dark ? WORDMARK_WHITE : WORDMARK}
            style={{ width: 196, height: 196 / WORDMARK_RATIO }}
            contentFit="contain"
            accessibilityLabel={env.brandName}
          />
          <Text style={[styles.product, { color: dark ? '#5B82FF' : BLUE }]}>{PRODUCT_WORD.toUpperCase()}</Text>
          <Text style={[styles.tagline, { color: muted }]}>{t('splash.tagline')}</Text>
        </Animated.View>
      </Animated.View>
      <View style={styles.dots} accessibilityLabel="Loading">
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: BLUE,
                opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.22, 1] }),
                transform: [{ scale: d.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) }],
              },
            ]}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Over the mark, centred the same way, so one hands over to the other in place.
  words: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  product: { fontSize: 12, fontWeight: '700', letterSpacing: 5, marginTop: 10 },
  tagline: { fontSize: 14, marginTop: 18, letterSpacing: 0.1 },
  dots: { position: 'absolute', bottom: 72, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
