/**
 * Follow-ups: everything that brings people back, in one tab.
 *
 *  - Due: reminders, and (WhatsApp app mode) the series steps to send by hand.
 *  - Automations: auto follow-up series (visit-based ones are set up from Visits).
 *  - Send: campaigns (Cloud API only) and quick replies.
 *
 * Each row opens the screen that does the work and shows what is waiting there.
 */
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { AlarmClock, ChevronRight, Megaphone, Repeat, Send, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { RequireCan } from '@/components/RequireCan';
import { StorageNotice } from '@/components/StorageNotice';
import { Group, GroupRow, Screen, Text } from '@/components/ui';
import { useReminders, useSequences } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { P } from '@/lib/permissions';
import { rtlFlip } from '@/lib/rtl';
import { dueTaskCounts } from '@/services/crm/waTasks';
import { useCan } from '@/stores/auth';
import { useFeatures } from '@/stores/features';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A row's right side: a small count pill (red when something is overdue) and the
 * chevron. Without a count, nothing: the row shows its usual chevron.
 */
function RowEnd({ value, urgent }: { value: number; urgent?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.right}>
      <View style={[styles.count, { backgroundColor: urgent ? colors.danger : colors.primarySoft }]}>
        <Text variant="micro" style={{ color: urgent ? '#fff' : colors.primary, letterSpacing: 0 }}>
          {value > 99 ? '99+' : value}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textFaint} style={rtlFlip()} />
    </View>
  );
}

const count = (value: number | undefined, urgent?: boolean) => (value ? <RowEnd value={value} urgent={urgent} /> : undefined);

function FollowUpsHub() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const features = useFeatures();
  const api = useWhatsAppConfig().mode === 'api';
  const can = {
    campaigns: useCan(P.campaigns.list),
    schedule: useCan(P.scheduled.create),
  };

  const reminders = useReminders();
  const sequences = useSequences(features.followups);
  const tasks = useQuery({ queryKey: ['waTasks', 'counts'], queryFn: dueTaskCounts, staleTime: 60_000, enabled: features.followups && !api });

  const now = useNow();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const open = (reminders.data ?? []).filter((r) => !r.done && Date.parse(r.due_at) <= endOfToday.getTime());
  const overdueReminders = open.some((r) => Date.parse(r.due_at) < now);
  const activeSeries = (sequences.data ?? []).filter((s) => s.active).length;
  const taskCount = (tasks.data?.today ?? 0) + (tasks.data?.overdue ?? 0);
  const go = (href: Href) => () => router.push(href);

  type Row = { key: string; icon: React.ReactNode; title: string; subtitle: string; href: Href; right?: React.ReactNode };
  const section = (title: string, rows: (Row | false)[]) => {
    const shown = rows.filter((r): r is Row => !!r);
    if (!shown.length) return null;
    return (
      <Group title={title}>
        {shown.map((r, i) => (
          <GroupRow key={r.key} icon={r.icon} tint={colors.primary} title={r.title} subtitle={r.subtitle} right={r.right} onPress={go(r.href)} last={i === shown.length - 1} />
        ))}
      </Group>
    );
  };

  return (
    <Screen title={t('more.followUps')} subtitle={t('hub.sub')} scroll onRefresh={() => Promise.all([reminders.refetch(), sequences.refetch(), tasks.refetch()])}>
      <View style={{ gap: 18, marginTop: 8 }}>
        <StorageNotice />
        {section(t('hub.due'), [
          {
            key: 'reminders',
            icon: <AlarmClock size={18} />,
            title: t('more.reminders'),
            subtitle: t('more.remindersSub'),
            href: '/(app)/reminders',
            right: count(open.length, overdueReminders),
          },
          // With the WhatsApp app, series steps wait here to be sent by hand.
          features.followups &&
            !api && {
              key: 'wa-tasks',
              icon: <Send size={18} />,
              title: t('waTasks.title'),
              subtitle: t('waTasks.sub'),
              href: '/(app)/wa-tasks',
              right: count(taskCount, !!tasks.data?.overdue),
            },
        ])}
        {section(t('hub.automations'), [
          features.followups &&
            can.schedule && {
              key: 'series',
              icon: <Repeat size={18} />,
              title: t('followup.title'),
              subtitle: api ? t('followup.sub') : t('waTasks.seriesSub'),
              href: '/(app)/followups',
              right: count(activeSeries),
            },
        ])}
        {section(t('hub.send'), [
          // Broadcasts need approved templates: Cloud API only.
          api &&
            features.crm &&
            can.campaigns && {
              key: 'campaigns',
              icon: <Megaphone size={18} />,
              title: t('tabs.campaigns'),
              subtitle: t('camp.moreSub'),
              href: '/(app)/campaigns',
            },
          // Saved replies are sent through the WhatsApp API channel.
          api && {
            key: 'quick',
            icon: <Zap size={18} />,
            title: t('quick.title'),
            subtitle: t('quick.moreSub'),
            href: '/(app)/settings/quick-replies',
          },
        ])}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { minWidth: 24, height: 22, paddingHorizontal: 7, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});

/** Members whose role can't see contacts get a short explanation instead. */
export default function FollowUpsHubGate() {
  return (
    <RequireCan any={[P.contacts.list]}>
      <FollowUpsHub />
    </RequireCan>
  );
}
