/**
 * Where Meta's WhatsApp signup comes back to (`followupscrm://channel-connected`,
 * or `/channel-connected` on the web) with `?status=…&token=…`.
 *
 * - Web popup: hands the URL to the window that opened it, which closes it.
 * - Otherwise (a phone's deep link, a mobile browser tab): opens the confirm
 *   step, unless the screen that started the signup already did.
 */
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import { returnParams } from '@/components/channels/useSignup';
import { Loading, Text } from '@/components/ui';
import { claimSignupReturn, parseSignupReturn } from '@/services/crm/channels';

export default function ChannelConnected() {
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const [inPopup] = useState(() => Platform.OS === 'web' && WebBrowser.maybeCompleteAuthSession().type === 'success');

  useEffect(() => {
    if (inPopup) return;
    const ret = parseSignupReturn(params);
    if (ret && claimSignupReturn(ret)) {
      router.replace({ pathname: '/(app)/channels/connect', params: returnParams(ret) });
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/channels');
    }
  }, [inPopup, params]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {inPopup ? <Text center>{t('channels.returnClose')}</Text> : <Loading />}
    </View>
  );
}
