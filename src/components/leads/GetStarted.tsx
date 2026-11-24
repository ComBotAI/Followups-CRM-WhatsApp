/**
 * Contacts, first run: the three ways to get people in, each one tap away.
 * Phone contacts (the phone app only), a spreadsheet, or one at a time.
 */
import { router } from 'expo-router';
import { Contact, FileUp, UserPlus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { Group, GroupRow, Text } from '@/components/ui';
import { GradientDisc } from '@/components/ui/kit';
import { useTheme } from '@/theme/ThemeProvider';

export function GetStarted({ canCreate, canImport }: { canCreate: boolean; canImport: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rows = [
    canCreate &&
      Platform.OS !== 'web' && {
        key: 'phone',
        icon: <Contact size={18} />,
        title: t('syncContacts.title'),
        subtitle: t('syncContacts.sub'),
        go: () => router.push('/(app)/sync/contacts'),
      },
    canImport && {
      key: 'import',
      icon: <FileUp size={18} />,
      title: t('leads.importSheet'),
      subtitle: t('more.importSub'),
      go: () => router.push('/(app)/import'),
    },
    canCreate && {
      key: 'add',
      icon: <UserPlus size={18} />,
      title: t('leads.addLead'),
      subtitle: undefined as string | undefined,
      go: () => router.push('/(app)/lead/new'),
    },
  ].filter((r): r is Exclude<typeof r, false> => !!r);
  return (
    <View style={styles.wrap}>
      <GradientDisc size={56}>
        <UserPlus size={24} color={colors.primary} />
      </GradientDisc>
      <View style={{ gap: 6, alignItems: 'center' }}>
        <Text variant="h2" center>
          {t('leads.emptyTitle')}
        </Text>
        <Text tone="muted" center style={{ maxWidth: 320 }}>
          {t('leads.emptyBody')}
        </Text>
      </View>
      {rows.length ? (
        <Group style={{ alignSelf: 'stretch' }}>
          {rows.map((r, i) => (
            <GroupRow key={r.key} icon={r.icon} tint={colors.primary} title={r.title} subtitle={r.subtitle} onPress={r.go} last={i === rows.length - 1} />
          ))}
        </Group>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 18, paddingHorizontal: 20, paddingTop: 40, width: '100%', maxWidth: 480, alignSelf: 'center' },
});
