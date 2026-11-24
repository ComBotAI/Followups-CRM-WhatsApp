/**
 * Today: one ranked follow-up queue built from overdue and due follow-ups and
 * follow-up reminders. WhatsApp, call or skip each one. Follow-up series messages
 * to send with the WhatsApp app, and task / WhatsApp reminders due today, sit above it.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AlarmClock, ChevronRight, MessageCircle, Phone, Send, SkipForward, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Button, Chip, EmptyState, Hero, Row, Sheet, StatusPill, Text } from '@/components/ui';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { SnoozeSheet, tomorrowTen } from '@/components/leads/ReminderSheet';
import { useReminders } from '@/hooks/queries';
import { dueTaskCounts } from '@/services/crm/waTasks';
import { useFeatures } from '@/stores/features';
import { applyLeadChange, showLocalReminders, useReminderActions } from '@/hooks/useReminderActions';
import { completeFollowUp } from '@/services/reminders';
import { useMyId, useMyName } from '@/stores/auth';
import { reminderKind, type Reminder, type ReminderKind } from '@/services/crm/records';
import { useTabBarInset } from '@/components/navigation/FloatingTabBar';
import { useNow } from '@/hooks/useNow';
import { callPhone, messageOnWhatsApp, plainWhatsApp } from '@/lib/actions';
import { formatPhone } from '@/lib/phone';
import { fromNow } from '@/lib/time';
import { buildTodayQueue, skipToday, withoutItem, type TodayItem, type TodayReason } from '@/services/today';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { openContact } from '@/stores/contactPanel';
import { DesktopColumn } from '@/components/ui/DesktopColumn';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';

function TodayScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const bar = useTabBarInset();
  const qc = useQueryClient();
  const myId = useMyId();
  const myName = useMyName();
  // The lead just called or messaged: one tap says how it went and when to follow up next.
  const [followed, setFollowed] = useState<TodayItem | null>(null);
  const q = useQuery({ queryKey: ['today'], queryFn: () => buildTodayQueue(), staleTime: 60_000 });
  const items = q.data ?? [];
  const reminders = useReminders();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const dueOf = (k: ReminderKind) =>
    (reminders.data ?? []).filter((r) => !r.done && reminderKind(r) === k && Date.parse(r.due_at) <= endOfDay.getTime());
  // Follow-up series steps waiting to be sent with the WhatsApp app (same counts as the Leads card).
  const followupsOn = useFeatures().followups;
  const waTasks = useQuery({ queryKey: ['waTasks', 'counts'], queryFn: dueTaskCounts, staleTime: 60_000, enabled: followupsOn });
  const waToSend = followupsOn ? (waTasks.data?.today ?? 0) + (waTasks.data?.overdue ?? 0) : 0;
  const tasks = dueOf('task');
  const whatsapps = dueOf('whatsapp');

  const reasonColor = (r: TodayReason) =>
    ({ overdue: colors.warning, reminder: colors.warning, dueToday: colors.primary })[r];
  const counts = items.reduce<Record<string, number>>((acc, it) => ({ ...acc, [it.reasons[0]]: (acc[it.reasons[0]] ?? 0) + 1 }), {});

  // Off the list at once, from the cached queue (no rebuild).
  const drop = (it: TodayItem) => {
    skipToday(it.key);
    qc.setQueryData<TodayItem[]>(['today'], (prev) => withoutItem(prev, it.key));
  };
  const skip = drop;

  /** Done (next = null) or the next follow-up: ticks today's call reminders, sets the next one, moves the lead. */
  const finish = async (it: TodayItem, next: Date | null) => {
    setFollowed(null);
    drop(it);
    if (!it.leadId) return;
    const lead = await completeFollowUp(
      { contact_id: it.leadId, contact_name: it.name, phone: it.phone, member_id: myId, member_name: myName },
      next ? { at: next, note: t('reminders.callLead', { name: it.name || formatPhone(it.phone) }) } : null,
    );
    showLocalReminders(qc);
    if (lead) applyLeadChange(qc, lead);
  };

  return (
    <DesktopColumn>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <FlatList
          data={items}
          keyExtractor={(it) => it.key}
          refreshing={q.isFetching && !q.isLoading}
          onRefresh={() => {
            void q.refetch();
            if (followupsOn) void waTasks.refetch();
          }}
          contentContainerStyle={{ paddingBottom: bar + 24 }}
          ListHeaderComponent={
            <View>
              <Hero title={t('today.title')} subtitle={q.isLoading ? t('common.loading') : t('today.sub', { count: items.length })}>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {(Object.keys(counts) as TodayReason[]).map((r) => (
                    <StatusPill key={r} label={`${t(`today.reason.${r}`)} · ${counts[r]}`} color="#fff" onHero />
                  ))}
                </Row>
              </Hero>
              {waToSend ? (
                <Pressable
                  onPress={() => router.push('/(app)/wa-tasks')}
                  style={({ pressed }) => [styles.waCard, { backgroundColor: pressed ? colors.surfaceAlt : colors.successSoft }]}
                >
                  <Send size={18} color={colors.success} />
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {t('waTasks.card', { count: waToSend })}
                  </Text>
                  {waTasks.data?.overdue ? (
                    <Text variant="caption" tone="danger" style={{ fontWeight: '700' }}>
                      {t('waTasks.overdueN', { count: waTasks.data.overdue })}
                    </Text>
                  ) : null}
                  <ChevronRight size={18} color={colors.textFaint} />
                </Pressable>
              ) : null}
              <ReminderList title={t('today.tasksToday')} rows={tasks} />
              <ReminderList title={t('today.whatsappToday')} rows={whatsapps} whatsapp />
              {(tasks.length || whatsapps.length || waToSend) && items.length ? <SectionLabel title={t('today.followUpsToday')} count={items.length} /> : null}
            </View>
          }
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => (item.leadId ? openContact(item.leadId) : undefined)}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent', borderBottomColor: colors.border }]}
            >
              <Text variant="micro" tone="faint" style={{ width: 18, textAlign: 'center' }}>
                {index + 1}
              </Text>
              <Avatar name={item.name || item.phone} size={42} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {item.name || formatPhone(item.phone)}
                </Text>
                {/* Short pills, the time as text after them: a long pill would run into the buttons. */}
                <Row gap={5} style={{ flexWrap: 'wrap' }}>
                  {item.reasons.slice(0, 2).map((r) => (
                    <StatusPill key={r} label={t(`today.reason.${r}`)} color={reasonColor(r)} />
                  ))}
                  {item.at ? (
                    <Text variant="micro" tone="faint" numberOfLines={1}>
                      {fromNow(new Date(item.at))}
                    </Text>
                  ) : null}
                </Row>
              </View>
              <Pressable onPress={() => skip(item)} hitSlop={8} style={styles.small} accessibilityLabel={t('today.skip')}>
                <SkipForward size={18} color={colors.textFaint} />
              </Pressable>
              <Pressable
                onPress={() => {
                  setFollowed(item);
                  messageOnWhatsApp({ phone: item.phone, leadId: item.leadId || undefined });
                }}
                onLongPress={plainWhatsApp(item.phone)}
                hitSlop={6}
                style={[styles.round, { backgroundColor: colors.whatsappSoft }]}
              >
                <MessageCircle size={17} color="#128C7E" />
              </Pressable>
              <Pressable
                onPress={() => {
                  setFollowed(item);
                  void callPhone(item.phone);
                }}
                hitSlop={6}
                style={[styles.round, { backgroundColor: colors.primarySoft }]}
              >
                <Phone size={17} color={colors.primary} />
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={
            q.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
            ) : tasks.length || whatsapps.length || waToSend ? undefined : (
              <EmptyState icon={<Sparkles size={26} color="#fff" />} title={t('today.empty')} body={t('today.emptyBody')} />
            )
          }
        />
        {followed ? <OutcomeSheet item={followed} onPick={(next) => void finish(followed, next)} onClose={() => setFollowed(null)} /> : null}
      </View>
    </DesktopColumn>
  );
}

/** After a call or WhatsApp: done, or when to follow up next, in one tap. */
function OutcomeSheet({ item, onPick, onClose }: { item: TodayItem; onPick: (next: Date | null) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [openedAt] = useState(() => Date.now());
  const [picking, setPicking] = useState(false);
  const [custom, setCustom] = useState(() => tomorrowTen(openedAt));
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('today.outcomeTitle', { defaultValue: 'Followed up?' })}
      subtitle={item.name || formatPhone(item.phone)}
      footer={picking ? <Button title={t('today.outcomeSave', { defaultValue: 'Set next follow-up' })} full onPress={() => onPick(custom)} /> : undefined}
    >
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <Chip label={t('today.outcome.done', { defaultValue: 'Done' })} onPress={() => onPick(null)} />
        <Chip label={t('today.outcome.plus1', { defaultValue: '+1 day' })} onPress={() => onPick(tomorrowTen(Date.now(), 1))} />
        <Chip label={t('today.outcome.plus3', { defaultValue: '+3 days' })} onPress={() => onPick(tomorrowTen(Date.now(), 3))} />
        <Chip label={t('today.outcome.pick', { defaultValue: 'Pick date' })} selected={picking} onPress={() => setPicking(true)} />
      </Row>
      {picking ? <DateTimeField value={custom} minimumDate={new Date(openedAt)} label={t('reminders.pickDateTime')} selected onChange={setCustom} /> : null}
      <Text variant="caption" tone="muted">
        {t('today.outcomeHint', { defaultValue: "Ticks today's call reminders for this lead and sets the next follow-up." })}
      </Text>
    </Sheet>
  );
}

function SectionLabel({ title, count }: { title: string; count: number }) {
  return (
    <Text variant="micro" tone="faint" style={styles.section}>
      {`${title.toUpperCase()} · ${count}`}
    </Text>
  );
}

/** Task or WhatsApp reminders due by tonight: tick one to finish it. */
function ReminderList({ title, rows, whatsapp }: { title: string; rows: Reminder[]; whatsapp?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { toggle, remove, snooze } = useReminderActions();
  const now = useNow();
  const [snoozing, setSnoozing] = useState<Reminder | null>(null);
  if (!rows.length) return null;
  return (
    <View>
      {snoozing ? <SnoozeSheet reminder={snoozing} onSnooze={(r, due) => void snooze(r, due)} onClose={() => setSnoozing(null)} /> : null}
      <SectionLabel title={title} count={rows.length} />
      {rows.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => (r.contact_id ? openContact(r.contact_id) : undefined)}
          onLongPress={() => void remove(r)}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent', borderBottomColor: colors.border }]}
        >
          {/* A wide target: the 22pt box alone was easy to miss, opening the contact instead. */}
          <Pressable onPress={() => void toggle(r)} accessibilityRole="checkbox" accessibilityState={{ checked: false }} style={styles.tickArea}>
            <View style={[styles.tick, { borderColor: colors.borderStrong }]} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {r.note}
            </Text>
            <Text variant="caption" tone={Date.parse(r.due_at) < now ? 'danger' : 'muted'} numberOfLines={1}>
              {`${r.contact_name || formatPhone(r.phone)} · ${fromNow(new Date(r.due_at))}`}
            </Text>
          </View>
          <Pressable
            onPress={() => setSnoozing(r)}
            hitSlop={6}
            style={styles.small}
            accessibilityLabel={t('reminders.snoozeTitle', { defaultValue: 'Snooze' })}
          >
            <AlarmClock size={18} color={colors.textFaint} />
          </Pressable>
          {whatsapp && r.phone ? (
            <Pressable
              onPress={() => messageOnWhatsApp({ phone: r.phone, leadId: r.contact_id || undefined })}
              onLongPress={plainWhatsApp(r.phone)}
              hitSlop={6}
              style={[styles.round, { backgroundColor: colors.whatsappSoft }]}
            >
              <MessageCircle size={17} color="#128C7E" />
            </Pressable>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  waCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 14, padding: 12, borderRadius: radius.md },
  section: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6, letterSpacing: 0.4 },
  tickArea: { width: 44, height: 44, marginVertical: -8, marginStart: -4, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 22, height: 22, borderRadius: 6, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  small: { width: 30, height: 38, alignItems: 'center', justifyContent: 'center' },
});

/** Members whose role can't open this page get a short explanation instead. */
export default function TodayScreenGate() {
  return (
    <RequireCan any={[P.contacts.list]}>
      <TodayScreen />
    </RequireCan>
  );
}
