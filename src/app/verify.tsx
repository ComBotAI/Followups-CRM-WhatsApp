/**
 * Email verification link from the sign-in server: `/verify?token=…` on the web
 * and inside the app. Confirms the address,
 * then offers sign-in. A captcha may be required by the project.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { useCaptchaField } from '@/components/captcha/useCaptchaField';
import { Button, Text } from '@/components/ui';
import { setAuthAccessId } from '@/services/accessId';
import { verifyEmail } from '@/services/sso/client';
import { useTheme } from '@/theme/ThemeProvider';
import type { Metadata } from 'expo-router/server';

import { linkToken } from '@/lib/linkToken';
import { onPhoneBrowser, openInApp } from '@/lib/openInApp';
import { pageMeta } from '@/lib/seo';

/** Web: this page's title and description for search and link previews. */
export function generateMetadata(): Metadata {
  return pageMeta('/verify');
}

export default function VerifyEmail() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ token?: string | string[]; access?: string }>();
  const token = linkToken(params.token);
  const captcha = useCaptchaField('submit');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      if (params.access) setAuthAccessId(params.access);
      await verifyEmail(token, await captcha.getToken());
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.errorTitle'));
      captcha.reset();
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title={t('verify.title')} subtitle={t('verify.missing')}>
        <Button title={t('auth.backToSignIn')} full onPress={() => router.replace('/(auth)/login')} />
      </AuthShell>
    );
  }

  if (done) {
    // Verified in a phone's browser: send them on to the app to sign in there.
    const phone = onPhoneBrowser();
    return (
      <AuthShell title={t('verify.done')} subtitle={phone ? t('verify.openAppBody') : t('verify.doneBody')}>
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <MailCheck size={44} color={colors.success} />
        </View>
        {phone ? (
          <>
            <Button title={t('verify.openApp')} size="lg" full onPress={() => openInApp(phone, 'login')} />
            <Button title={t('verify.signInWeb')} variant="ghost" full onPress={() => router.replace('/(auth)/login')} />
          </>
        ) : (
          <Button title={t('auth.signIn')} size="lg" full onPress={() => router.replace('/(auth)/login')} />
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('verify.title')} subtitle={t('verify.sub')}>
      <View style={{ gap: 14 }}>
        {captcha.element}
        {error ? (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        ) : null}
        <Button title={t('verify.button')} size="lg" full loading={busy || captcha.loading} onPress={() => void verify()} />
        <Button title={t('auth.backToSignIn')} variant="ghost" full onPress={() => router.replace('/(auth)/login')} />
      </View>
    </AuthShell>
  );
}
