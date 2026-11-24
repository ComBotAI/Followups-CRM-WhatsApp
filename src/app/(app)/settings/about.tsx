import * as Application from 'expo-application';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { APP_NAME, BrandMark } from '@/components/Brand';
import { Screen, Text } from '@/components/ui';

/** The company behind the app (the same details as the website's legal footer). */
const COMPANY = {
  name: 'Com Bot AI Limited',
  address: '501, Trinity Orion, Vesu Main Road, Surat - 395007, Gujarat, India',
};

export default function AboutScreen() {
  const { t } = useTranslation();
  const version = (Application.nativeApplicationVersion ?? '1.0').split('.').slice(0, 2).join('.');
  return (
    <Screen title={t('settings.about')} back>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80, paddingHorizontal: 24 }}>
        <BrandMark size={84} />
        <Text variant="h2">{APP_NAME}</Text>
        <Text tone="muted">v{version}</Text>
        <View style={{ alignItems: 'center', gap: 4, marginTop: 20 }}>
          <Text variant="caption" tone="muted" center>
            {t('about.poweredBy')}
          </Text>
          <Text variant="bodyStrong" center>
            {COMPANY.name}
          </Text>
          <Text variant="caption" tone="muted" center selectable style={{ maxWidth: 320 }}>
            {COMPANY.address}
          </Text>
        </View>
      </View>
    </Screen>
  );
}
