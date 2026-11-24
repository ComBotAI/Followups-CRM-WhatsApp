/**
 * Shared frame for every auth screen. Clean & airy: the form sits directly on
 * the page in a narrow centred column (logo, title, one line of context, the
 * fields). Desktop web adds a brand panel on the left: brand blue with the
 * mark and what the app is for.
 */
import { goBack } from '@/lib/nav';
import { ArrowLeft, BellRing, MessageCircle, Repeat } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo, BrandMark } from '@/components/Brand';
import { Text } from '@/components/ui';
import { env } from '@/config/env';
import { useDesktop } from '@/hooks/useDesktop';
import { rtlFlip } from '@/lib/rtl';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  title: string;
  subtitle?: string;
  back?: boolean;
  /** Runs instead of plain `goBack()` (e.g. to cancel adding an account). */
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  showLogo?: boolean;
};

const BRAND_BLUE = '#1F45D6';

/** Desktop only: the brand panel beside the form. */
function BrandPanel() {
  const { t } = useTranslation();
  const points = [
    { Icon: MessageCircle, text: t('app.subtitle') },
    { Icon: Repeat, text: t('hub.sub') },
    { Icon: BellRing, text: t('more.remindersSub') },
  ];
  return (
    <View style={[styles.panel, { backgroundColor: BRAND_BLUE }]}>
      <BrandLogo height={34} light />
      <View style={{ gap: 18 }}>
        <Text style={styles.panelHeadline}>{t('app.tagline')}</Text>
        {points.map(({ Icon, text }) => (
          <View key={text} style={styles.point}>
            <View style={styles.pointIcon}>
              <Icon size={16} color="#fff" />
            </View>
            <Text style={styles.pointText}>{text}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.panelFoot}>© {env.brandName}</Text>
    </View>
  );
}

export function AuthShell({ title, subtitle, back, onBack, children, footer, showLogo = true }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  const form = (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + (desktop ? 48 : 16), paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>
        <View style={styles.topRow}>
          {back ? (
            <Pressable
              onPress={onBack ?? (() => goBack())}
              hitSlop={10}
              accessibilityRole="button"
              style={({ pressed }) => [styles.back, { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceAlt }]}
            >
              <ArrowLeft size={20} color={colors.text} style={rtlFlip()} />
            </Pressable>
          ) : null}
        </View>
        {/* Phones show the mark (the full logo is in the desktop panel). */}
        {showLogo && !desktop ? <BrandMark size={52} /> : null}
        <View style={{ gap: 8, marginTop: showLogo && !desktop ? 24 : 0, marginBottom: 28 }}>
          <Text variant="display">{title}</Text>
          {subtitle ? (
            <Text tone="muted" variant="body">
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={{ gap: 14 }}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </ScrollView>
  );
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      {desktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <BrandPanel />
          <View style={{ flex: 1 }}>{form}</View>
        </View>
      ) : (
        form
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  column: { width: '100%', maxWidth: 400, alignSelf: 'center', flex: 1, justifyContent: 'center' },
  topRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 28,
    flexWrap: 'wrap',
  },
  panel: { width: '42%', maxWidth: 560, padding: 48, justifyContent: 'space-between' },
  panelHeadline: { color: '#fff', fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8, marginBottom: 8 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  pointText: { color: 'rgba(255,255,255,0.88)', fontSize: 15, lineHeight: 21, flex: 1 },
  panelFoot: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
});
