/**
 * Shown to the workspace owner when something the app runs on is missing: some
 * of its lead custom fields, or the app's cloud data store (or one of its
 * tables). Its button opens the setup journey (fields, then the data store plan).
 */
import { RefreshCw } from 'lucide-react-native';
import { router } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useFields } from '@/hooks/queries';
import {
  cachedHandle,
  dataStoreVersion,
  ensureDataStore,
  onDataStoreChange,
  requiredCollections,
  type DataStoreHandle,
} from '@/services/crm/datastore';
import { LEAD_FIELDS } from '@/services/crm/schema';
import { useAccountsStore } from '@/stores/accounts';
import { useIsOwner } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

/** The active account's data store handle, re-read whenever a setup attempt finishes. */
export function useDataStoreHandle(): DataStoreHandle | null {
  const acct = useAccountsStore((s) => s.activeId);
  useSyncExternalStore(onDataStoreChange, dataStoreVersion, dataStoreVersion);
  useEffect(() => {
    // Cheap when already set up (cached); otherwise this is the first look.
    if (acct) void ensureDataStore().catch(() => undefined);
  }, [acct]);
  return acct ? cachedHandle(acct) : null;
}

export function SetupBanner({ style }: { style?: object }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const acct = useAccountsStore((s) => s.activeId);
  const isOwner = useIsOwner();
  const fields = useFields();
  const ds = useDataStoreHandle();

  if (!isOwner || !acct) return null;

  const present = new Set((fields.data ?? []).map((f) => f.slug));
  const missingFields = fields.data ? LEAD_FIELDS.filter((f) => !present.has(f.slug)).length : 0;
  const needed = requiredCollections(acct);
  // Not looked yet, or not needed by any feature: nothing to say about the store.
  // A store the CRM refuses ("not included") gets the storage notice instead.
  const storeMissing = !!ds && needed.length > 0 && ds.kind !== 'plan' && (!ds.available || needed.some((k) => !ds.collections[k]));
  if (!missingFields && !storeMissing) return null;

  const what = [missingFields ? t('setupBanner.fields', { count: missingFields }) : null, storeMissing ? t('setupBanner.store') : null]
    .filter(Boolean)
    .join(t('setupBanner.and'));

  return (
    <View style={[styles.card, { backgroundColor: colors.warningSoft, borderRadius: radius.lg }, style]}>
      <View style={[styles.icon, { backgroundColor: colors.warning }]}>
        <RefreshCw size={16} color="#fff" />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="bodyStrong">{t('setupBanner.title')}</Text>
        <Text variant="caption" tone="muted">
          {t('setupBanner.body', { what })}
        </Text>
        <Button
          title={t('setupBanner.cta')}
          size="sm"
          style={{ marginTop: 6, alignSelf: 'flex-start' }}
          onPress={() => router.push('/workspace-setup')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, padding: 14 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
