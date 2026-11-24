/**
 * Visits: the front desk. One big "Check in", today's numbers (visits,
 * returning vs new guests, revenue), today's visits, and what goes out next
 * (thank-yous, "we miss you", birthday wishes, due-again reminders) so the
 * team sees the messages bringing guests back.
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CalendarHeart, ChartColumn, ChevronRight, Gift, Repeat, Settings2, Sparkles, Store, UserCheck, Wrench } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { RequireCan } from '@/components/RequireCan';
import { StorageNotice } from '@/components/StorageNotice';
import { Avatar, Button, Group, GroupRow, Hero, HeroButton, Row, SectionHeader, Skeleton, StatusPill, Text } from '@/components/ui';
import { useTabBarInset } from '@/components/navigation/FloatingTabBar';
import { DesktopColumn } from '@/components/ui/DesktopColumn';
import { useNow } from '@/hooks/useNow';
import { formatCompact } from '@/lib/money';
import { P } from '@/lib/permissions';
import { rtlFlip } from '@/lib/rtl';
import { fromNow } from '@/lib/time';
import { listDueRuns, listVisitsSince, type RunKind, type ServiceRun, type ServiceVisit } from '@/services/crm/services';
import { industryOf } from '@/services/visits/industries';
import { openContact } from '@/stores/contactPanel';
import { useCan } from '@/stores/auth';
import { useVisitsConfig } from '@/stores/visits';
import { useTheme } from '@/theme/ThemeProvider';

const KIND_ICON: Record<RunKind, typeof Repeat> = { visit: Repeat, service: Wrench, milestone: Gift, occasion: CalendarHeart };


/** Today's numbers in one quiet strip. */
function Stats({ visits }: { visits: ServiceVisit[] | undefined }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const total = visits?.length ?? 0;
  const returning = visits?.filter((v) => v.returning).length ?? 0;
  const revenue = visits?.reduce((s, v) => s + (v.price ?? 0), 0) ?? 0;
  const cells = [
    { label: t('visits.todayVisits'), value: String(total) },
    { label: t('visits.returning'), value: String(returning) },
    { label: t('visits.newGuests'), value: String(total - returning) },
    // Fits half a phone: 2,930 · 4,52,300 · 12.4M.
    { label: t('visits.revenue'), value: revenue ? formatCompact(revenue) : '—' },
  ];
  return (
    <View style={[styles.stats, { borderColor: colors.border, borderRadius: radius.lg }]}>
      {cells.map((c, i) => (
        // Two by two, so every number and label fits a phone in full.
        <View
          key={c.label}
          style={[
            styles.stat,
            i % 2 === 1 && { borderStartWidth: StyleSheet.hairlineWidth, borderStartColor: colors.border },
            i >= 2 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
          ]}
        >
          {visits ? (
            <Text variant="h1" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
              {c.value}
            </Text>
          ) : (
            <Skeleton h={28} w={40} />
          )}
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SetupBanner() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/(app)/visits/setup')}
      style={({ pressed }) => [styles.banner, { backgroundColor: pressed ? colors.surfacePressed : colors.primarySoft, borderRadius: radius.lg }]}
    >
      <View style={[styles.bannerIcon, { backgroundColor: colors.primary }]}>
        <Sparkles size={18} color="#fff" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{t('visits.setupBanner')}</Text>
        <Text variant="caption" tone="muted">
          {t('visits.setupBannerBody')}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.primary} style={rtlFlip()} />
    </Pressable>
  );
}

function VisitRow({ v }: { v: ServiceVisit }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => (v.contactId ? openContact(v.contactId) : undefined)}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent', borderBottomColor: colors.border }]}
    >
      <Avatar name={v.contactName || '?'} size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Row gap={8}>
          <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {v.contactName || '—'}
          </Text>
          {!v.returning ? <StatusPill label={t('visits.newGuest')} color={colors.primary} /> : null}
        </Row>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {[v.serviceNames.join(', '), v.partySize ? t('visits.partyN', { count: v.partySize }) : null, fromNow(new Date(v.visitedAt))]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {v.price ? (
        <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
          {v.price.toLocaleString()}
        </Text>
      ) : null}
    </Pressable>
  );
}

function DueRow({ r }: { r: ServiceRun }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const Icon = KIND_ICON[r.kind];
  return (
    <Pressable
      onPress={() => (r.contactId ? openContact(r.contactId) : undefined)}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent', borderBottomColor: colors.border }]}
    >
      <View style={[styles.kindIcon, { backgroundColor: colors.surfaceAlt }]}>
        <Icon size={17} color={colors.textMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {r.contactName || '—'}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {`${t(`visits.kind.${r.kind}`)} · ${r.sequenceName}`}
        </Text>
      </View>
      <Text variant="caption" tone="faint" numberOfLines={1}>
        {r.nextDue ? fromNow(new Date(r.nextDue)) : ''}
      </Text>
    </Pressable>
  );
}

function VisitsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const bar = useTabBarInset();
  const config = useVisitsConfig();
  const industry = industryOf(config.industry);
  // Members see only what their role can open.
  const can = { visit: useCan(P.app.visits), manage: useCan(P.app.services), reports: useCan(P.app.reports) };
  const now = useNow(60_000);
  const startOfDay = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now]);
  const day = startOfDay.toDateString();
  const today = useQuery({ queryKey: ['visits', 'today', day], queryFn: () => listVisitsSince(startOfDay), staleTime: 30_000 });
  const due = useQuery({
    queryKey: ['visits', 'due', day],
    queryFn: () => listDueRuns(new Date(startOfDay.getTime() + 8 * 86_400_000)),
    staleTime: 60_000,
  });

  const header = (
    <View>
      <Hero
        title={t('visits.title')}
        subtitle={industry ? industry.name : t('visits.sub')}
        right={
          can.manage || can.reports ? (
            <Row gap={8}>
              {can.reports ? (
                <HeroButton label={t('reports.title')} onPress={() => router.push('/(app)/reports')}>
                  <ChartColumn size={18} />
                </HeroButton>
              ) : null}
              {can.manage ? (
                <HeroButton label={t('visits.setupTitle')} onPress={() => router.push('/(app)/visits/setup')}>
                  <Settings2 size={18} />
                </HeroButton>
              ) : null}
            </Row>
          ) : undefined
        }
      />
      <View style={styles.body}>
        {/* No cloud storage (not in the plan): nothing here can be saved, say so first. */}
        <StorageNotice />
        {!config.industry && can.manage ? <SetupBanner /> : null}
        {can.visit ? (
          <Button title={t('visits.checkIn')} size="lg" icon={<UserCheck size={19} color="#fff" />} onPress={() => router.push('/(app)/visits/check-in')} />
        ) : null}
        <Stats visits={today.data} />
        <SectionHeader title={t('visits.recent')} style={{ marginTop: 8 }} />
      </View>
    </View>
  );

  return (
    <DesktopColumn>
      <FlatList
        style={{ flex: 1, backgroundColor: colors.background }}
        data={today.data ?? []}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => <VisitRow v={item} />}
        refreshing={(today.isRefetching || due.isRefetching) && !today.isLoading}
        onRefresh={() => void Promise.all([today.refetch(), due.refetch()])}
        contentContainerStyle={{ paddingBottom: bar + 32 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          today.isLoading ? undefined : (
            <View style={styles.empty}>
              <Store size={22} color={colors.textFaint} />
              <Text variant="bodyStrong">{t('visits.noVisits')}</Text>
              <Text variant="caption" tone="muted" center style={{ maxWidth: 300 }}>
                {t('visits.noVisitsBody')}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          <View style={{ marginTop: 24 }}>
            <View style={styles.body}>
              <SectionHeader title={t('visits.dueBack')} />
              <Text variant="caption" tone="muted" style={{ marginTop: -4 }}>
                {t('visits.dueBackSub')}
              </Text>
            </View>
            {(due.data ?? []).map((r) => (
              <DueRow key={r.id} r={r} />
            ))}
            {due.data && !due.data.length ? (
              <Text variant="caption" tone="faint" style={{ paddingHorizontal: 20, paddingTop: 12 }}>
                {t('visits.nothingDue')}
              </Text>
            ) : null}
            {/* Everything setup created stays editable (for those allowed to change it). */}
            {can.manage ? (
              <Group title={t('visits.manage')} style={{ marginHorizontal: 20, marginTop: 28 }}>
                <GroupRow
                  icon={<Store size={18} />}
                  tint={colors.primary}
                  title={t('visits.servicesTitle')}
                  subtitle={t('services.sub')}
                  onPress={() => router.push('/(app)/settings/services')}
                />
                <GroupRow
                  icon={<Repeat size={18} />}
                  tint={colors.primary}
                  title={t('visits.automationsTitle')}
                  subtitle={t('followup.sub')}
                  onPress={() => router.push('/(app)/followups')}
                />
                <GroupRow
                  last
                  icon={<Settings2 size={18} />}
                  tint={colors.primary}
                  title={t('visits.businessType')}
                  subtitle={industry?.name ?? t('visits.notSetUp')}
                  onPress={() => router.push('/(app)/visits/setup')}
                />
              </Group>
            ) : null}
          </View>
        }
      />
    </DesktopColumn>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, gap: 14 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  stat: { width: '50%', paddingVertical: 14, paddingHorizontal: 16, gap: 2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  bannerIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  kindIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 28, paddingHorizontal: 20 },
});

export default function VisitsScreenGate() {
  return (
    <RequireCan any={[P.contacts.list]}>
      <VisitsScreen />
    </RequireCan>
  );
}
