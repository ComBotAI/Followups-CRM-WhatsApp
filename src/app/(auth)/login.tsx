import { Redirect, router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { Image } from 'expo-image';
import { Clock, Eye, EyeOff, KeyRound, Lock, Mail, UserRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { useAuthConfig, useCaptchaField } from '@/components/captcha/useCaptchaField';
import { Button, Input, Row, Switch, Text } from '@/components/ui';
import { getAuthAccessId, hasChosenAccessId, isAccessIdFixed, onAuthAccessIdChange } from '@/services/accessId';
import { forgetSavedLogin, saveLogin, savedLogins, type SavedLogin } from '@/services/savedLogins';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';
import type { Metadata } from 'expo-router/server';

import { pageMeta } from '@/lib/seo';

/** Web: this page's title and description for search and link previews. */
export function generateMetadata(): Metadata {
  return pageMeta('/login');
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const login = useAuthStore((s) => s.login);
  const pending = useAuthStore((s) => s.pending);
  const adding = useAuthStore((s) => s.adding);
  const cancelAddAccount = useAuthStore((s) => s.cancelAddAccount);
  const authConfig = useAuthConfig();
  const captcha = useCaptchaField('submit');
  // Back after the sign-in expired: say so and start from the same email.
  const expired = useAuthStore((s) => s.expired);
  const [email, setEmail] = useState(expired?.email ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const layout = captcha.config?.cardLayout;
  // "Save password": logins kept on this device for this Access ID (they survive sign-outs and expiry).
  // Follows the sign-in Access ID: this screen can stay mounted while another project is chosen.
  const [accessId, setAccessId] = useState(getAuthAccessId);
  useEffect(() => onAuthAccessIdChange(setAccessId), []);
  const [saved, setSaved] = useState<SavedLogin[]>([]);
  const [remember, setRemember] = useState(true);
  /** The saved login whose password is in the field, so editing the email can swap it out again. */
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const savedFor = (e: string) => saved.find((l) => l.email.toLowerCase() === e.trim().toLowerCase());

  const fill = (l: SavedLogin) => {
    setEmail(l.email);
    setPassword(l.password);
    setFilledFrom(l.email.toLowerCase());
    setRemember(true);
    setError(null);
  };

  useEffect(() => {
    let live = true;
    void savedLogins(accessId).then((list) => {
      if (!live) return;
      setSaved(list);
      // Back after an expiry: that account's login. Otherwise the last one used, unless adding another account.
      const pick = expired?.email ? list.find((l) => l.email.toLowerCase() === expired.email.toLowerCase()) : adding ? undefined : list[0];
      if (pick) fill(pick);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessId]);

  const onEmail = (v: string) => {
    setEmail(v);
    const match = savedFor(v);
    if (match) fill({ ...match, email: v });
    else if (filledFrom) {
      // Typed away from a saved login: its password isn't this one's.
      setPassword('');
      setFilledFrom(null);
    }
  };

  const onRemember = (v: boolean) => {
    setRemember(v);
    // Unticked: forget this login's saved password right away, not only after the next sign-in.
    if (!v && savedFor(email)) {
      void forgetSavedLogin(accessId, email);
      setSaved((list) => list.filter((l) => l.email.toLowerCase() !== email.trim().toLowerCase()));
      setFilledFrom(null);
    }
  };

  useEffect(() => {
    if (pending?.kind === '2fa') router.push('/(auth)/otp');
    if (pending?.kind === 'account') router.push('/(auth)/accounts');
  }, [pending]);

  const submit = async () => {
    if (!email.trim() || !password) return setError(t('auth.enterCreds'));
    setBusy(true);
    setError(null);
    // The project this sign-in goes to (the one `login` uses), read now rather than at render.
    const project = getAuthAccessId();
    try {
      const captchaToken = await captcha.getToken();
      await login(email.trim(), password, captchaToken);
      // The password was accepted (a 2FA code may still follow): keep it, or forget it, as asked.
      if (remember) void saveLogin(project, email.trim(), password);
      else void forgetSavedLogin(project, email.trim());
    } catch (err) {
      // A saved password that is refused (changed or reset since) is dropped, so it isn't filled in again.
      const status = (err as { status?: number } | null)?.status;
      if (filledFrom && status === 401) {
        void forgetSavedLogin(project, email.trim());
        setSaved((list) => list.filter((l) => l.email.toLowerCase() !== email.trim().toLowerCase()));
        setFilledFrom(null);
      }
      setError(err instanceof Error ? err.message : t('auth.signInFailed'));
      captcha.reset();
    } finally {
      setBusy(false);
    }
  };

  if (!hasChosenAccessId()) return <Redirect href="/(auth)/access" />;

  return (
    <AuthShell
      title={adding ? t('accounts.addTitle') : t('auth.welcomeBack')}
      subtitle={adding ? t('accounts.addSub') : t('app.subtitle')}
      // Locked to one Access ID: there is no Access ID step to go back to (only out of "add account").
      back={!isAccessIdFixed() || adding}
      onBack={() => {
        if (isAccessIdFixed()) {
          cancelAddAccount();
          goBack('/');
        } else goBack('/(auth)/access');
      }}
    >
      {expired && !adding ? (
        <View style={[styles.expired, { backgroundColor: colors.warningSoft }]} accessibilityRole="alert">
          <Clock size={18} color={colors.warning} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{t('auth.expiredTitle')}</Text>
            <Text variant="caption" tone="muted">
              {t('auth.expiredBody', { workspace: expired.workspace })}
            </Text>
          </View>
        </View>
      ) : null}
      {isAccessIdFixed() ? null : (
        <Pressable onPress={() => router.push('/(auth)/access')} style={[styles.access, { backgroundColor: colors.surfaceAlt }]} hitSlop={4}>
          {authConfig.data?.brandLogoUrl ? (
            <Image source={{ uri: authConfig.data.brandLogoUrl }} style={styles.accessLogo} contentFit="contain" />
          ) : (
            <KeyRound size={16} color={colors.primary} />
          )}
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {t('access.verified')}
            </Text>
          </View>
          <Text variant="caption" tone="primary" style={{ fontWeight: '700' }}>
            {t('access.change')}
          </Text>
        </Pressable>
      )}
      <Input
        label={t('auth.email')}
        placeholder={t('auth.emailPlaceholder')}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        value={email}
        onChangeText={onEmail}
        left={<Mail size={18} color={colors.textFaint} />}
      />
      {saved.length > 1 || (saved.length === 1 && !savedFor(email)) ? (
        <View style={styles.savedList}>
          {saved
            .filter((l) => l.email.toLowerCase() !== email.trim().toLowerCase())
            .map((l) => (
              <Pressable
                key={l.email}
                onPress={() => fill(l)}
                style={[styles.savedChip, { backgroundColor: colors.surfaceAlt }]}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={t('auth.useSavedLogin', { email: l.email })}
              >
                <UserRound size={14} color={colors.primary} />
                <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {l.email}
                </Text>
              </Pressable>
            ))}
        </View>
      ) : null}
      <Input
        label={t('auth.password')}
        placeholder="••••••••"
        secureTextEntry={!show}
        autoComplete="password"
        textContentType="password"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setFilledFrom(null);
        }}
        onSubmitEditing={() => void submit()}
        left={<Lock size={18} color={colors.textFaint} />}
        right={
          <Pressable onPress={() => setShow((v) => !v)} hitSlop={8}>
            {show ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
          </Pressable>
        }
      />
      <Row style={styles.rememberRow}>
        <Pressable onPress={() => onRemember(!remember)} style={styles.remember} hitSlop={6} accessibilityRole="switch" accessibilityState={{ checked: remember }}>
          <Switch value={remember} onChange={onRemember} />
          <Text variant="caption">{t('auth.savePassword')}</Text>
        </Pressable>
        {(layout?.forgotPasswordEnabled ?? true) ? (
          <Pressable onPress={() => router.push('/(auth)/forgot')} hitSlop={8}>
            <Text variant="caption" tone="primary" style={{ fontWeight: '700' }}>
              {t('auth.forgot')}
            </Text>
          </Pressable>
        ) : null}
      </Row>
      {captcha.element}
      {error ? (
        <Text variant="caption" tone="danger" center>
          {error}
        </Text>
      ) : null}
      <Button title={t('auth.signIn')} size="lg" full onPress={() => void submit()} loading={busy || captcha.loading} />
      {layout?.termsEnabled || layout?.privacyPolicyEnabled ? (
        <Row gap={14} style={{ justifyContent: 'center' }}>
          {layout.termsEnabled && layout.termsUrl ? (
            <Pressable onPress={() => void Linking.openURL(layout.termsUrl!)}>
              <Text variant="micro" tone="faint">
                {t('auth.terms')}
              </Text>
            </Pressable>
          ) : null}
          {layout.privacyPolicyEnabled && layout.privacyPolicyUrl ? (
            <Pressable onPress={() => void Linking.openURL(layout.privacyPolicyUrl!)}>
              <Text variant="micro" tone="faint">
                {t('auth.privacy')}
              </Text>
            </Pressable>
          ) : null}
        </Row>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  expired: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12 },
  access: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  accessLogo: { width: 28, height: 28, borderRadius: 8 },
  rememberRow: { justifyContent: 'space-between', alignItems: 'center', marginTop: -4 },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  savedList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -6 },
  savedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, maxWidth: '100%' },
});
