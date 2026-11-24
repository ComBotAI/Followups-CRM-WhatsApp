/**
 * Shown where the app needs the cloud data store (Visits, Follow-ups) when the
 * workspace doesn't have one. Says the store isn't available only when the CRM
 * refused it; any other failure (not created yet, offline…) gets the sync
 * banner instead.
 */
import { Database } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SetupBanner, useDataStoreHandle } from '@/components/SetupBanner';
import { Text } from '@/components/ui';
import { useIsOwner } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

export function StorageNotice({ style }: { style?: object }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const isOwner = useIsOwner();
  const ds = useDataStoreHandle();
  if (!ds || ds.available) return null;
  if (ds.kind !== 'plan' && ds.kind !== 'payment') return <SetupBanner style={style} />;
  return (
    <View style={[styles.card, { backgroundColor: colors.warningSoft, borderRadius: radius.lg }, style]}>
      <View style={[styles.icon, { backgroundColor: colors.warning }]}>
        <Database size={17} color="#fff" />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="bodyStrong">{ds.kind === 'payment' ? t('storage.paymentTitle') : t('storage.title')}</Text>
        <Text variant="caption" tone="muted">
          {ds.kind === 'payment' ? ds.reason : isOwner ? t('storage.body') : t('storage.bodyMember')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, padding: 14 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
