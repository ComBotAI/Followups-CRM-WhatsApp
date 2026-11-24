import { AlarmClock, MessageCircle, Phone, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';

import { Avatar, EmptyState, IconButton, Row, Screen, Text } from '@/components/ui';
import { SnoozeSheet } from '@/components/leads/ReminderSheet';
import { useReminders } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { formatWhen, isToday } from '@/lib/time';
import { reminderKind, type Reminder } from '@/services/crm/records';
import { useReminderActions } from '@/hooks/useReminderActions';
import { callPhone, messageOnWhatsApp, plainWhatsApp } from '@/lib/actions';
import { useTheme } from '@/theme/ThemeProvider';
import { openContact } from '@/stores/contactPanel';

export default function RemindersScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const reminders = useReminders();
  const now = useNow();

  const sections = useMemo(() => {
    const all = reminders.data ?? [];
    const open = all.filter((r) => !r.done).sort((a, b) => a.due_at.localeCompare(b.due_at));
    const done = all
      .filter((r) => r.done)
      .sort((a, b) => b.done_at.localeCompare(a.done_at))
      .slice(0, 20);
    const over = (r: Reminder) => Date.parse(r.due_at) < now;
    return [
      {
        key: 'overdue',
        title: t('reminders.overdue'),
        data: open.filter(over),
      },
      {
        key: 'today',
        title: t('reminders.today'),
        data: open.filter((r) => !over(r) && isToday(new Date(r.due_at))),
      },
      {
        key: 'upcoming',
        title: t('reminders.upcoming'),
        data: open.filter((r) => !over(r) && !isToday(new Date(r.due_at))),
      },
      { key: 'done', title: t('reminders.done'), data: done },
    ].filter((s) => s.data.length);
  }, [reminders.data, now, t]);

  const openCount = (reminders.data ?? []).filter((r) => !r.done).length;

  const { toggle, remove, snooze } = useReminderActions();
  const [snoozing, setSnoozing] = useState<Reminder | null>(null);

  return (
    <Screen title={t('reminders.title')} subtitle={t('reminders.open', { count: openCount })} back padded={false}>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        refreshing={reminders.isFetching}
        onRefresh={() => void reminders.refetch()}
        renderSectionHeader={({ section }) => (
          <Text variant="micro" tone={section.key === 'overdue' ? 'danger' : 'faint'} style={[styles.header, { backgroundColor: colors.background }]}>
            {section.title.toUpperCase()}
          </Text>
        )}
        renderItem={({ item: r, section }) => {
          const overdue = section.key === 'overdue';
          return (
            <Pressable onPress={() => openContact(r.contact_id)} style={styles.row}>
              <Pressable
                onPress={() => void toggle(r)}
                hitSlop={8}
                style={[
                  styles.check,
                  {
                    borderColor: r.done ? colors.success : colors.borderStrong,
                    backgroundColor: r.done ? colors.success : 'transparent',
                    borderRadius: radius.xs,
                  },
                ]}
              />
              <Avatar name={r.contact_name || r.phone} size={38} />
              <View style={{ flex: 1 }}>
                <Text
                  variant="bodyStrong"
                  numberOfLines={1}
                  style={
                    r.done
                      ? {
                          textDecorationLine: 'line-through',
                          color: colors.textFaint,
                        }
                      : undefined
                  }
                >
                  {r.contact_name || r.phone}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {r.note}
                </Text>
                <Row gap={4}>
                  <AlarmClock size={11} color={overdue ? colors.danger : colors.textFaint} />
                  <Text variant="micro" tone={overdue ? 'danger' : 'faint'}>
                    {formatWhen(r.due_at)}
                  </Text>
                </Row>
              </View>
              {!r.done && r.phone && reminderKind(r) === 'whatsapp' ? (
                <Pressable
                  onPress={() => messageOnWhatsApp({ phone: r.phone, leadId: r.contact_id || undefined })}
                  onLongPress={plainWhatsApp(r.phone)}
                  hitSlop={6}
                  style={[styles.wa, { backgroundColor: colors.whatsappSoft }]}
                >
                  <MessageCircle size={18} color="#128C7E" />
                </Pressable>
              ) : null}
              {!r.done && r.phone && reminderKind(r) === 'call' ? (
                <IconButton
                  tone="primary"
                  onPress={() =>
                    void callPhone(r.phone)
                  }
                >
                  <Phone size={18} color={colors.primary} />
                </IconButton>
              ) : null}
              {!r.done ? (
                <IconButton size={36} onPress={() => setSnoozing(r)}>
                  <AlarmClock size={16} color={colors.textMuted} />
                </IconButton>
              ) : null}
              <IconButton tone="danger" size={36} onPress={() => void remove(r)}>
                <Trash2 size={16} color={colors.danger} />
              </IconButton>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState icon={<AlarmClock size={26} color={colors.primary} />} title={t('reminders.emptyTitle')} body={t('reminders.emptyBody')} />
        }
        contentContainerStyle={{ paddingBottom: 80 }}
      />
      {snoozing ? <SnoozeSheet reminder={snoozing} onSnooze={(r, due) => void snooze(r, due)} onClose={() => setSnoozing(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  check: { width: 22, height: 22, borderWidth: 2 },
  wa: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
