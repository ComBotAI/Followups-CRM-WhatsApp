/**
 * WhatsApp to send: follow-up series steps waiting to be sent with the
 * WhatsApp app — missed ones from earlier days first, then today's, and
 * optionally what's coming up. Each opens WhatsApp with the message ready.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';

import { useTabBarInset } from '@/components/navigation/FloatingTabBar';
import { Chip, EmptyState, Row, Screen, Text } from '@/components/ui';
import { WaTaskRow } from '@/components/whatsapp/WaTaskList';
import { describeCrmError } from '@/services/crm/client';
import { listDueTasks, type WaTask } from '@/services/crm/waTasks';
import { useTheme } from '@/theme/ThemeProvider';

export default function WaTasksScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const bar = useTabBarInset();
  const [upcoming, setUpcoming] = useState(false);
  const q = useQuery({ queryKey: ['waTasks', 'list', upcoming], queryFn: () => listDueTasks({ upcoming }) });
  const tasks = q.data ?? [];
  const startOfToday = new Date(q.dataUpdatedAt || 0);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = startOfToday.getTime() + 86400_000;
  const group = (from: number, to: number) => tasks.filter((x) => Date.parse(x.dueAt) >= from && Date.parse(x.dueAt) < to);
  const sections: { key: string; title: string; data: WaTask[] }[] = [
    { key: 'overdue', title: t('waTasks.overdue'), data: group(0, startOfToday.getTime()) },
    { key: 'today', title: t('waTasks.today'), data: group(startOfToday.getTime(), endOfToday) },
    ...(upcoming ? [{ key: 'later', title: t('waTasks.later'), data: group(endOfToday, Number.MAX_SAFE_INTEGER) }] : []),
  ].filter((s) => s.data.length);

  const changed = () => {
    void qc.invalidateQueries({ queryKey: ['waTasks'] });
  };

  return (
    <Screen title={t('waTasks.title')} subtitle={t('waTasks.sub')} back padded={false}>
      <SectionList
        sections={sections}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bar + 24 }}
        refreshing={q.isRefetching}
        onRefresh={() => void q.refetch()}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View>
            <Row gap={6} style={{ paddingVertical: 10 }}>
              <Chip small label={t('waTasks.dueNow')} selected={!upcoming} onPress={() => setUpcoming(false)} />
              <Chip small label={t('waTasks.withUpcoming')} selected={upcoming} onPress={() => setUpcoming(true)} />
            </Row>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text variant="micro" tone={section.key === 'overdue' ? 'danger' : 'faint'} style={{ marginTop: 12 }}>
            {`${section.title} · ${section.data.length}`.toUpperCase()}
          </Text>
        )}
        renderItem={({ item, section }) => <WaTaskRow task={item} overdue={section.key === 'overdue'} onChanged={changed} />}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />}
        ListEmptyComponent={
          q.isLoading ? (
            <ActivityIndicator style={{ padding: 32 }} color={colors.primary} />
          ) : q.error ? (
            <Text tone="danger">{describeCrmError(q.error)}</Text>
          ) : (
            <EmptyState icon={<MessageCircle size={26} color="#fff" />} title={t('waTasks.empty')} body={t('waTasks.emptyBody')} />
          )
        }
      />
    </Screen>
  );
}
