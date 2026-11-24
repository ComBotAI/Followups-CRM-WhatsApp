/**
 * Lead detail. A compact gradient header (who, status, and the three ways to
 * reach them), then the next step, one row of things to log, and
 * tabs for the timeline, reminders and details. Everything rarer (edit,
 * assign, mark won, copy, delete) sits in the ⋯ menu.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import {
  AlarmClock,
  ArrowLeft,
  Bell,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Copy,
  MessageCircle,
  MoreHorizontal,
  MessageSquare,
  NotebookPen,
  Pencil,
  Phone,
  Repeat,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssignSheet } from '@/components/leads/AssignSheet';
import { RemarkSheet } from '@/components/leads/RemarkSheet';
import { ScheduledMessages } from '@/components/leads/ScheduledMessages';
import { StartFollowupSheet } from '@/components/leads/StartFollowupSheet';
import { ReminderSheet } from '@/components/leads/ReminderSheet';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  GroupRow,
  Loading,
  Row,
  Screen,
  Sheet,
  StatusPill,
  Text,
  UnderlineTabs,
  useStatusColor,
} from '@/components/ui';
import { useFields, useLead, useLeadOptions, useReminders, useRemarks, useUpdateLead } from '@/hooks/queries';
import { callPhone, copyPhone, openSms, messageOnWhatsApp, plainWhatsApp } from '@/lib/actions';
import { confirmAction, showAlert } from '@/lib/dialog';
import { trashLead } from '@/services/crm/leads';
import { listDueTasks } from '@/services/crm/waTasks';
import { WaTaskRow } from '@/components/whatsapp/WaTaskList';
import { formatPhone } from '@/lib/phone';
import { formatWhen, fromNow, isOverdue } from '@/lib/time';
import { useTierColor } from '@/components/visits/tier';
import { isCallReminder, type Remark, type Reminder } from '@/services/crm/records';
import { useReminderActions } from '@/hooks/useReminderActions';
import { isUserField, type LeadStatus } from '@/services/crm/schema';
import { useCan, useIsOwner } from '@/stores/auth';
import { P } from '@/lib/permissions';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import { useTabBarInset } from '@/components/navigation/FloatingTabBar';
import { ContactServices } from '@/components/services/ContactServices';
import { ContactVisits } from '@/components/services/ContactVisits';
import { RecordVisitSheet } from '@/components/services/RecordVisitSheet';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { useTheme } from '@/theme/ThemeProvider';
import { rtlFlip } from '@/lib/rtl';
import { DesktopColumn } from '@/components/ui/DesktopColumn';
import { useDesktop } from '@/hooks/useDesktop';
import { useFeatures } from '@/stores/features';

type Tab = 'activity' | 'reminders' | 'visits' | 'services' | 'messages' | 'details';
type Activity = { kind: 'remark'; at: string; remark: Remark };

/**
 * The contact page: full screen on phones (route `/lead/[id]`), and in the
 * right-side panel on desktop web (`onClose` given).
 */
export function LeadView({ id, onClose }: { id: string; onClose?: () => void }) {
  const { t } = useTranslation();
  const close = onClose ?? (() => goBack());
  const inPanel = !!onClose;
  const { colors, radius, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const barInset = useTabBarInset();
  const qc = useQueryClient();
  const isOwner = useIsOwner();
  // What the role allows on a contact (owners: everything).
  const can = { update: useCan(P.contacts.update), delete: useCan(P.contacts.delete), schedule: useCan(P.scheduled.create), visit: useCan(P.app.visits) };
  const desktop = useDesktop();
  const statusColor = useStatusColor();
  const tierColor = useTierColor();
  const lead = useLead(id);
  const options = useLeadOptions();
  const update = useUpdateLead();
  const remarks = useRemarks(id);
  const reminders = useReminders();
  const pull = usePullRefresh(() => Promise.all([lead.refetch(), remarks.refetch(), qc.invalidateQueries({ queryKey: ['wa', 'schedules', id] }), qc.invalidateQueries({ queryKey: ['services', 'contact', id] })]));
  const [tab, setTab] = useState<Tab>('activity');
  // Phones and the side panel: once Call / WhatsApp / Message scroll out of view, a slim copy stays at the bottom.
  const [pinned, setPinned] = useState(false);
  const buttonsBottom = useRef(0);
  const [sheet, setSheet] = useState<'status' | 'remark' | 'reminder' | 'assign' | 'followup' | 'visit' | 'more' | null>(null);
  // The reminder the reminder sheet moves (the follow-up card's "change"); undefined = a new one.
  const [editing, setEditing] = useState<Reminder | undefined>(undefined);
  const waApi = useWhatsAppConfig().mode === 'api';
  const leadTasks = useQuery({ queryKey: ['waTasks', 'lead', id], queryFn: () => listDueTasks({ contactId: id, upcoming: true }), enabled: !!id });
  const features = useFeatures();
  const fieldDefs = useFields();

  const activity = useMemo<Activity[]>(
    () =>
      (remarks.data ?? [])
        .map((remark) => ({
          kind: 'remark' as const,
          at: remark.created_on,
          remark,
        }))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [remarks.data],
  );
  const reminderActions = useReminderActions();
  const myReminders = useMemo(
    () => (reminders.data ?? []).filter((r) => r.contact_id === id).sort((a, b) => a.due_at.localeCompare(b.due_at)),
    [reminders.data, id],
  );

  if (lead.isLoading)
    return inPanel ? (
      <Loading label={t('common.loading')} />
    ) : (
      <Screen back>
        <Loading label={t('common.loading')} />
      </Screen>
    );
  if (!lead.data)
    return inPanel ? (
      <EmptyState title={t('leads.notFound')} body={String((lead.error as Error)?.message ?? '')} action={t('common.close')} onAction={close} />
    ) : (
      <Screen back>
        <EmptyState title={t('leads.notFound')} body={String((lead.error as Error)?.message ?? '')} />
      </Screen>
    );
  const l = lead.data;
  const sColor = statusColor(l.status || 'New');
  const statusLabel = t(`status.${l.status || 'New'}`, { defaultValue: l.status || 'New' });
  const overdue = !!l.nextFollowUp && isOverdue(l.nextFollowUp);
  const nextLine = l.nextFollowUp ? formatWhen(l.nextFollowUp) : t('leads.noFollowUp');
  const edit = () => {
    onClose?.();
    router.push({ pathname: '/lead/new', params: { id: l.id } });
  };
  const remove = async () => {
    setSheet(null);
    const ok = await confirmAction({
      title: t('trash.deleteLeadQ'),
      message: t('trash.deleteLeadBody'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await trashLead(l.id);
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['board'] });
      close();
    } catch (err) {
      showAlert(t('common.couldNotSave'), err instanceof Error ? err.message : '');
    }
  };

  const setStatus = async (status: LeadStatus) => {
    setSheet(null);
    try {
      await update.mutateAsync({ lead: l, input: { status } });
    } catch (err) {
      showAlert(t('common.couldNotSave'), err instanceof Error ? err.message : '');
    }
  };

  const details: [string, string][] = [
    [t('auth.mobile'), l.phone ? formatPhone(l.phone) : ''],
    // The platform's own email and source, when it has them (read-only here).
    [t('auth.email'), l.email],
    [t('filter.assignedTo'), l.assignedName],
    [t('visits.field.birthday'), l.birthday],
    [t('visits.field.anniversary'), l.anniversary],
    ...(fieldDefs.data ?? [])
      .filter((f) => isUserField(f.slug))
      .map((f): [string, string] => [f.name ?? f.slug, l.extra[f.slug] == null ? '' : String(l.extra[f.slug])]),
    [t('leads.source'), l.source],
    [t('leads.created'), formatWhen(l.createdAt)],
  ];

  // Desktop web, full page: the contact on the left, its history on the right, each scrolling on its own.
  const split = desktop && !inPanel;
  const summary = (
    <>
      <View style={[styles.hero, { paddingTop: inPanel || desktop ? 16 : insets.top + 8 }]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <GlassButton label={inPanel ? t('common.close') : t('common.back')} onPress={close}>
            {inPanel ? <X size={20} color={colors.text} /> : <ArrowLeft size={20} color={colors.text} style={rtlFlip()} />}
          </GlassButton>
          <Row gap={8}>
            {can.update ? (
              <GlassButton label={t('leads.editDetails')} onPress={edit}>
                <Pencil size={17} color={colors.text} />
              </GlassButton>
            ) : null}
            <GlassButton label={t('leads.moreActions')} onPress={() => setSheet('more')}>
              <MoreHorizontal size={20} color={colors.text} />
            </GlassButton>
          </Row>
        </Row>

        <Row gap={14} style={styles.identity}>
          <Avatar name={l.name} uri={l.avatarUrl} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h1" numberOfLines={2} accessibilityRole="header">
              {l.name}
            </Text>
            <Pressable
              onPress={() => void copyPhone(l.phone)}
              disabled={!l.phone}
              accessibilityRole="button"
              accessibilityLabel={l.phone ? `${t('leads.copyNumber')}: ${formatPhone(l.phone)}` : t('leads.noNumber')}
              hitSlop={8}
              style={styles.phoneRow}
            >
              <Text variant="body" tone="muted">
                {l.phone ? formatPhone(l.phone) : t('leads.noNumber')}
              </Text>
              {l.phone ? <Copy size={13} color={colors.textFaint} /> : null}
            </Pressable>
          </View>
        </Row>

        <Row gap={8} style={{ marginTop: 14, flexWrap: 'wrap' }}>
          {/* Read-only for a role that can't edit contacts. */}
          <Pressable
            onPress={() => setSheet('status')}
            disabled={!can.update}
            accessibilityRole={can.update ? 'button' : 'text'}
            accessibilityLabel={`${t('leads.changeStatus')}: ${statusLabel}`}
            style={({ pressed }) => [styles.statusButton, { backgroundColor: `${sColor}14`, borderColor: `${sColor}33`, opacity: pressed ? 0.75 : 1 }]}
          >
            <View style={[styles.statusDot, { backgroundColor: sColor }]} />
            <Text variant="caption" style={{ color: sColor, fontWeight: '600' }}>
              {statusLabel}
            </Text>
            {can.update ? <ChevronDown size={14} color={sColor} /> : null}
          </Pressable>
          {l.tier && l.visitCount ? <StatusPill label={t(`visits.tier.${l.tier}`)} color={tierColor(l.tier)} /> : null}
        </Row>

        {/* Guest profile, once they have visited. */}
        {l.visitCount ? (
          <View style={[styles.guestStrip, { borderColor: colors.border, borderRadius: radius.md }]}>
            {[
              { label: t('visits.field.visits'), value: String(l.visitCount) },
              { label: t('visits.field.spent'), value: l.totalSpent ? l.totalSpent.toLocaleString() : '—' },
              { label: t('visits.field.last'), value: l.lastVisit ? fromNow(l.lastVisit) : '—' },
            ].map((c, i) => (
              <View key={c.label} style={[styles.guestCell, i > 0 && { borderStartWidth: StyleSheet.hairlineWidth, borderStartColor: colors.border }]}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {c.value}
                </Text>
                <Text variant="micro" tone="muted" numberOfLines={1}>
                  {c.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View
          style={{ marginTop: 18 }}
          onLayout={(e) => {
            // Relative to the header, which starts the scroll content.
            buttonsBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
          }}
        >
          {/* WhatsApp is the main way to follow up: one wide button, call and SMS as square icons beside it (no label to cut off). */}
          <Row gap={8}>
            <ContactButton
              primary
              label={t('common.whatsapp')}
              icon={<MessageCircle size={19} color="#fff" />}
              onPress={() => messageOnWhatsApp({ phone: l.phone, leadId: l.id })}
              onLongPress={plainWhatsApp(l.phone)}
              disabled={!l.phone}
            />
            <ContactButton
              label={t('common.call')}
              icon={<Phone size={18} color={colors.text} />}
              onPress={() => void callPhone(l.phone)}
              disabled={!l.phone}
            />
            <ContactButton
              label={t('common.message')}
              icon={<MessageSquare size={18} color={colors.text} />}
              onPress={() => void openSms(l.phone)}
              disabled={!l.phone}
            />
          </Row>
        </View>
      </View>

      <View style={styles.body}>
        <Pressable
          onPress={() => {
            // Change the follow-up = move its reminder (the earliest open call one), not add a second that rings too.
            setEditing(myReminders.find((r) => !r.done && isCallReminder(r)));
            setSheet('reminder');
          }}
          accessibilityRole="button"
          accessibilityLabel={`${overdue ? t('leads.overdue') : t('leads.nextFollowUp')}: ${nextLine}`}
          accessibilityHint={l.nextFollowUp ? t('leads.change') : t('leads.setReminder')}
        >
          <Card
            style={[
              styles.next,
              {
                borderColor: overdue ? `${colors.danger}55` : colors.border,
                backgroundColor: overdue ? colors.dangerSoft : colors.surface,
                borderWidth: 1,
              },
            ]}
          >
            <View
              style={[
                styles.nextIcon,
                {
                  backgroundColor: l.nextFollowUp ? (overdue ? colors.dangerSoft : colors.warningSoft) : colors.primarySoft,
                },
              ]}
            >
              <AlarmClock size={20} color={l.nextFollowUp ? (overdue ? colors.danger : colors.warning) : colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="micro" tone={overdue ? 'danger' : 'muted'} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {overdue ? t('leads.overdue') : l.nextFollowUp ? t('leads.nextFollowUp') : t('leads.nextStep')}
              </Text>
              <Text variant="bodyStrong">{nextLine}</Text>
              {l.followUpNote || l.lastRemark ? (
                <Text variant="caption" tone="muted" numberOfLines={2}>
                  {l.followUpNote || l.lastRemark}
                </Text>
              ) : null}
            </View>
            <ChevronRight size={20} color={colors.textFaint} style={rtlFlip()} />
          </Card>
        </Pressable>

        <Row gap={8}>
          <ToolTile
            icon={<NotebookPen size={20} color={colors.accent} />}
            tint={colors.accentSoft}
            label={t('common.remark')}
            onPress={() => setSheet('remark')}
          />
          <ToolTile
            icon={<Bell size={20} color={colors.success} />}
            tint={colors.successSoft}
            label={t('common.reminder')}
            onPress={() => {
              setEditing(undefined);
              setSheet('reminder');
            }}
          />
          {features.followups && can.schedule ? (
            <ToolTile
              icon={<Repeat size={20} color={colors.primary} />}
              tint={colors.primarySoft}
              label={t('followup.short')}
              onPress={() => setSheet('followup')}
            />
          ) : null}
          {features.services && can.visit ? (
            <ToolTile
              icon={<CalendarCheck size={20} color={colors.warning} />}
              tint={colors.warningSoft}
              label={t('services.recordVisit')}
              onPress={() => setSheet('visit')}
            />
          ) : null}
        </Row>
      </View>
    </>
  );
  const sections = (
    <>
      <View style={{ marginTop: 20 }}>
        <UnderlineTabs
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'activity',
              label: t('leads.activity'),
              count: activity.length || undefined,
            },
            {
              value: 'reminders',
              label: t('leads.reminders'),
              count: myReminders.filter((r) => !r.done).length || undefined,
            },
            ...(features.services
              ? [{ value: 'visits' as Tab, label: t('services.visits'), count: l.visitCount || undefined }]
              : []),
            { value: 'details', label: t('leads.details') },
            ...(features.services ? [{ value: 'services' as Tab, label: t('services.tab') }] : []),
            ...(waApi ? [{ value: 'messages' as Tab, label: t('sched.tab') }] : []),
          ]}
        />
      </View>

      <View style={styles.body}>
        {tab === 'activity' ? (
          activity.length ? (
            <View style={{ gap: 0 }}>
              {activity.map((a, i) => (
                <TimelineItem key={`r${a.remark.id}`} item={a} last={i === activity.length - 1} />
              ))}
            </View>
          ) : (
            <EmptyState title={t('leads.noRemarks')} body={t('leads.noRemarksBody')} action={t('leads.addRemark')} onAction={() => setSheet('remark')} />
          )
        ) : null}

        {tab === 'reminders' && leadTasks.data?.length ? (
          // Follow-up series steps to send with the WhatsApp app.
          <Card style={{ gap: 2, marginBottom: 12 }}>
            <Text variant="micro" tone="faint">
              {t('waTasks.title').toUpperCase()}
            </Text>
            {leadTasks.data.map((task) => (
              <WaTaskRow key={task.id} task={task} showName={false} onChanged={() => void leadTasks.refetch()} />
            ))}
          </Card>
        ) : null}
        {tab === 'reminders' ? (
          myReminders.length ? (
            <Card padded={false}>
              {myReminders.map((r, i) => (
                <Pressable
                  key={r.id}
                  onPress={() => void reminderActions.toggle(r)}
                  onLongPress={() => void reminderActions.remove(r)}
                  style={[
                    styles.reminder,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.check,
                      {
                        borderColor: r.done ? colors.success : colors.borderStrong,
                        backgroundColor: r.done ? colors.success : 'transparent',
                      },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={
                        r.done
                          ? {
                              textDecorationLine: 'line-through',
                              color: colors.textFaint,
                            }
                          : undefined
                      }
                    >
                      {r.note}
                    </Text>
                    <Text variant="micro" tone={!r.done && isOverdue(new Date(r.due_at)) ? 'danger' : 'faint'}>
                      {formatWhen(r.due_at)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void reminderActions.remove(r)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                    style={{ padding: 4 }}
                  >
                    <Trash2 size={16} color={colors.textFaint} />
                  </Pressable>
                </Pressable>
              ))}
            </Card>
          ) : (
            <EmptyState
              title={t('leads.noReminders')}
              action={t('leads.setReminder')}
              onAction={() => {
                setEditing(undefined);
                setSheet('reminder');
              }}
            />
          )
        ) : null}

        {tab === 'visits' ? <ContactVisits lead={l} /> : null}
        {tab === 'services' ? <ContactServices lead={l} /> : null}
        {tab === 'messages' && waApi ? (
          <ScheduledMessages
            contactId={l.id}
            onNew={() => router.push({ pathname: '/(app)/whatsapp/send', params: { leadId: l.id } })}
            onFollowup={() => setSheet('followup')}
          />
        ) : null}

        {tab === 'details' ? (
          <Card padded={false}>
            {details
              .filter(([, v]) => v)
              .map(([k, v], i) => (
                <View
                  key={k}
                  style={[
                    styles.detail,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  <Text variant="caption" tone="muted">
                    {k}
                  </Text>
                  <Text variant="bodyStrong" style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>
                    {v}
                  </Text>
                </View>
              ))}
            {can.update ? (
              <View style={{ padding: 12 }}>
                <Button title={t('leads.editDetails')} variant="secondary" full icon={<Pencil size={16} color={colors.primary} />} onPress={edit} />
              </View>
            ) : null}
          </Card>
        ) : null}
      </View>
    </>
  );
  const refresh = <RefreshControl refreshing={pull.refreshing} onRefresh={() => void pull.onRefresh()} tintColor={colors.primary} colors={[colors.primary]} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {split ? (
        <View style={styles.split}>
          <ScrollView style={styles.splitLeft} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
            {summary}
          </ScrollView>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} refreshControl={refresh}>
            {sections}
          </ScrollView>
        </View>
      ) : (
        // The side panel and phones: one column.
        <DesktopColumn>
          <ScrollView
            refreshControl={refresh}
            contentContainerStyle={{ paddingBottom: 40 + (barInset ? barInset + 22 : insets.bottom) + (pinned ? 64 : 0) }}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={64}
            onScroll={(e) => {
              const past = buttonsBottom.current > 0 && e.nativeEvent.contentOffset.y > buttonsBottom.current;
              if (past !== pinned) setPinned(past);
            }}
          >
            {summary}
            {sections}
          </ScrollView>
          {pinned && l.phone ? (
            <View
              style={[
                styles.pinned,
                shadow.floating,
                { backgroundColor: colors.surface, borderColor: colors.border, bottom: (barInset ? barInset + 8 : insets.bottom) + 8 },
              ]}
            >
              <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                {l.name}
              </Text>
              <PinnedAction label={t('common.message')} bg={colors.sms} onPress={() => void openSms(l.phone)} icon={<MessageSquare size={18} color="#fff" />} />
              <PinnedAction
                label={t('common.whatsapp')}
                bg="#1FAF55"
                onPress={() => messageOnWhatsApp({ phone: l.phone, leadId: l.id })}
                onLongPress={plainWhatsApp(l.phone)}
                icon={<MessageCircle size={18} color="#fff" />}
              />
              <PinnedAction
                label={t('common.call')}
                bg={colors.success}
                onPress={() => void callPhone(l.phone)}
                icon={<Phone size={18} color="#fff" fill="#fff" />}
              />
            </View>
          ) : null}
        </DesktopColumn>
      )}

      <StartFollowupSheet open={sheet === 'followup'} lead={l} onClose={() => setSheet(null)} />
      {sheet === 'visit' ? (
        <RecordVisitSheet
          contactId={l.id}
          lead={l}
          onClose={(changed) => {
            setSheet(null);
            if (changed) setTab('visits');
          }}
        />
      ) : null}
      <Sheet open={sheet === 'status'} onClose={() => setSheet(null)} title={t('leads.leadStatus')}>
        <View style={{ gap: 8 }}>
          {options.statuses.map((s) => {
            const active = l.status === s;
            return (
              <Pressable
                key={s}
                onPress={() => void setStatus(s as LeadStatus)}
                style={[
                  styles.statusOption,
                  {
                    backgroundColor: active ? colors.primarySoft : colors.surfaceAlt,
                    borderRadius: radius.md,
                  },
                ]}
              >
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: statusColor(s),
                  }}
                />
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {t(`status.${s}`, { defaultValue: s })}
                </Text>
                {active ? <Text tone="primary">✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title={l.name}>
        <View style={[styles.menu, { borderColor: colors.border, borderRadius: radius.lg }]}>
          {can.update ? (
            <GroupRow
              icon={<Pencil size={18} />}
              tint={colors.primary}
              title={t('leads.editDetails')}
              onPress={() => {
                setSheet(null);
                edit();
              }}
            />
          ) : null}
          {isOwner ? (
            <GroupRow
              icon={<Users size={18} />}
              tint={colors.primary}
              title={t('common.assign')}
              subtitle={l.assignedName || t('leads.unassigned')}
              onPress={() => setSheet('assign')}
            />
          ) : null}
          {l.status !== 'Won' && can.update ? (
            <GroupRow icon={<Trophy size={18} />} tint={colors.warning} title={t('leads.markWon')} onPress={() => void setStatus('Won')} />
          ) : null}
          {l.phone ? (
            <GroupRow
              icon={<Copy size={18} />}
              tint={colors.primary}
              title={t('leads.copyNumber')}
              subtitle={formatPhone(l.phone)}
              onPress={() => {
                setSheet(null);
                void copyPhone(l.phone);
              }}
            />
          ) : null}
          {can.delete ? (
            <GroupRow
              last
              danger
              icon={<Trash2 size={18} color={colors.danger} />}
              tint={colors.danger}
              title={t('trash.deleteLead')}
              onPress={() => void remove()}
              right={<View />}
            />
          ) : null}
        </View>
      </Sheet>
      <RemarkSheet lead={l} open={sheet === 'remark'} onClose={() => setSheet(null)} />
      {sheet === 'reminder' ? <ReminderSheet lead={l} reminder={editing} open onClose={() => setSheet(null)} /> : null}
      {sheet === 'assign' ? <AssignSheet leads={[l]} open onClose={() => setSheet(null)} /> : null}
    </View>
  );
}

function GlassButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.glass,
        { backgroundColor: pressed || hovered ? colors.surfacePressed : colors.surfaceAlt },
      ]}
    >
      {children}
    </Pressable>
  );
}

/** One of the three ways to reach the contact: equal width, icon and label, thumb-sized. */
/** A round icon button in the pinned bar. */
function PinnedAction({
  label,
  bg,
  icon,
  onPress,
  onLongPress,
}: {
  label: string;
  bg: string;
  icon: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.pinnedBtn, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }]}
    >
      {icon}
    </Pressable>
  );
}

/** A way to reach the contact. `primary` (WhatsApp) is the wide green one; the others are quiet. */
function ContactButton({
  label,
  icon,
  primary,
  onPress,
  onLongPress,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
}) {
  const { colors, radius } = useTheme();
  const bg = primary ? '#1FAF55' : colors.surfaceAlt;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.contactButton,
        primary ? { flex: 1 } : { width: 48, paddingHorizontal: 0 },
        {
          backgroundColor: pressed && !primary ? colors.surfacePressed : bg,
          borderRadius: radius.md,
          opacity: disabled ? 0.45 : primary && pressed ? 0.9 : 1,
        },
      ]}
    >
      {icon}
      {primary ? (
        <Text variant="bodyStrong" style={{ color: '#fff', fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Something to record against the contact. Tiles share the row equally. */
function ToolTile({ icon, tint, label, onPress }: { icon: React.ReactNode; tint: string; label: string; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border, borderRadius: radius.lg },
      ]}
    >
      <View style={[styles.tileIcon, { backgroundColor: tint }]}>{icon}</View>
      <Text variant="caption" style={{ fontWeight: '600' }} center numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function TimelineItem({ item, last }: { item: Activity; last: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.tl}>
      <View style={styles.tlRail}>
        <View style={[styles.tlDot, { backgroundColor: colors.accentSoft }]}>
          <NotebookPen size={14} color={colors.accent} />
        </View>
        {!last ? <View style={[styles.tlLine, { backgroundColor: colors.border }]} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: 18, gap: 2 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="bodyStrong">{t('common.remark')}</Text>
          <Text variant="micro" tone="faint">
            {formatWhen(item.at)}
          </Text>
        </Row>
        <Text>{item.remark.text}</Text>
        {item.remark.member_name ? (
          <Text variant="micro" tone="faint">
            {item.remark.member_name}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingBottom: 18 },
  glass: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { marginTop: 16 },
  guestStrip: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, marginTop: 14 },
  guestCell: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 28 },
  statusButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  contactButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 },
  tile: { flex: 1, minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8, borderWidth: StyleSheet.hairlineWidth },
  tileIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  menu: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  body: { paddingHorizontal: 16, gap: 12, marginTop: 16 },
  pinned: {
    position: 'absolute',
    start: 12,
    end: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingStart: 16,
    paddingEnd: 8,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pinnedBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  split: { flex: 1, flexDirection: 'row', gap: 24, padding: 24, width: '100%', maxWidth: 1320, alignSelf: 'center' },
  splitLeft: { width: 400, flexGrow: 0, flexShrink: 0 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tl: { flexDirection: 'row', gap: 12 },
  tlRail: { alignItems: 'center', width: 32 },
  tlDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tlLine: { width: 2, flex: 1, marginTop: 4 },
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 2 },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
});
