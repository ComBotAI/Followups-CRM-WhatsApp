/**
 * WhatsApp campaigns: every campaign of the account, newest first, grouped by
 * day (today, this week, earlier), filtered by state and searchable by name.
 * Each card shows how far its messages got; drafts can be picked up again.
 * Opens a campaign's report, or starts a new one.
 */
import type { Campaign, CampaignStatus } from '@ab-ecosystem/cpaas';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CalendarClock, Megaphone, Plus, Repeat, Search, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, ChipRow, EmptyState, Input, Row, Screen, SectionHeader, StatusPill, Text } from '@/components/ui';
import { campaignKeys, useStateColor } from '@/components/campaigns/shared';
import { describeCrmError } from '@/services/crm/client';
import { campaignState, campaignStats, listCampaigns } from '@/services/crm/campaigns';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { useDesktop } from '@/hooks/useDesktop';
import { RequireCan } from '@/components/RequireCan';
import { useCan } from '@/stores/auth';
import { P } from '@/lib/permissions';

type Filter = 'all' | 'scheduled' | 'processing' | 'completed' | 'failed';
const FILTERS: Filter[] = ['all', 'scheduled', 'processing', 'completed', 'failed'];
/** The server's state for each filter; "scheduled" also needs a send time (a draft has none). */
const STATUS: Record<Filter, CampaignStatus | undefined> = {
  all: undefined,
  scheduled: 'pending',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
};
const filterLabel = (f: Filter) => (f === 'all' ? 'camp.filter.all' : `camp.state.${f === 'processing' ? 'sending' : f}`);

const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** The time a card shows: when it finished, started, is due (still scheduled), or was made. */
const shownAt = (c: Campaign) => c.completedAt ?? c.processedAt ?? (campaignState(c) === 'scheduled' ? c.scheduledAt : undefined) ?? c.createdAt;

/** Scheduled ones first (their time is ahead), then by the time the card shows. */
type Group = 'scheduled' | 'today' | 'week' | 'earlier';
const groupOf = (c: Campaign): Group => {
  if (campaignState(c) === 'scheduled') return 'scheduled';
  const d = new Date(shownAt(c));
  const midnight = new Date(new Date().toDateString()).getTime();
  if (d.getTime() >= midnight) return 'today';
  return d.getTime() >= midnight - 6 * 86400_000 ? 'week' : 'earlier';
};

function CampaignsScreen() {
  const { t } = useTranslation();
  const canCreate = useCan(P.campaigns.create);
  const { colors } = useTheme();
  const config = useWhatsAppConfig();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const desktop = useDesktop();
  const q = useInfiniteQuery({
    queryKey: campaignKeys.list(filter),
    queryFn: ({ pageParam }) => listCampaigns({ status: STATUS[filter], cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: config.mode === 'api',
    // A campaign still processing: its state and counts move, so the list follows it.
    refetchInterval: (query) => (query.state.data?.pages.some((p) => p.data.some((c) => c.status === 'processing')) ? 30_000 : false),
  });
  const needle = search.trim().toLowerCase();
  // The list has no server-side search: it narrows what is loaded ("Load more" brings in older ones).
  const items = (q.data?.pages.flatMap((p) => p.data) ?? []).filter(
    (c) => (filter !== 'scheduled' || c.scheduledAt) && (!needle || c.name.toLowerCase().includes(needle)),
  );
  // Nothing shown yet (drafts filtered out of "Scheduled", or no name match) but more pages exist:
  // keep loading rather than say there are none.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  const waitingForMore = !items.length && !!hasNextPage;
  useEffect(() => {
    if (waitingForMore && !isFetchingNextPage) void fetchNextPage();
  }, [waitingForMore, isFetchingNextPage, fetchNextPage]);
  const groups = (['scheduled', 'today', 'week', 'earlier'] as Group[])
    .map((g) => ({ g, list: items.filter((c) => groupOf(c) === g) }))
    .filter((x) => x.list.length);

  if (config.mode !== 'api') {
    return (
      <Screen title={t('camp.title')}>
        <EmptyState
          icon={<Megaphone size={26} color="#fff" />}
          title={t('camp.needApi')}
          body={t('camp.needApiBody')}
          action={t('whatsapp.settings')}
          onAction={() => router.replace('/(app)/settings/whatsapp')}
        />
      </Screen>
    );
  }

  const nothing = !q.isLoading && !q.error && !items.length && !hasNextPage;
  return (
    <Screen
      title={t('camp.title')}
      subtitle={t('camp.sub')}
      scroll
      maxWidth={1100}
      onRefresh={() => q.refetch()}
      footer={
        canCreate ? <Button title={t('camp.new')} icon={<Plus size={18} color="#fff" />} onPress={() => router.push('/(app)/campaigns/new')} /> : undefined
      }
    >
      <View style={{ gap: 12, marginTop: 8, paddingBottom: 24 }}>
        <Input value={search} onChangeText={setSearch} placeholder={t('camp.search')} left={<Search size={16} color={colors.textMuted} />} />
        <ChipRow>
          {FILTERS.map((f) => (
            <Chip key={f} small label={t(filterLabel(f))} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ChipRow>
        {q.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: 24 }} /> : null}
        {q.error ? <Text tone="danger">{describeCrmError(q.error)}</Text> : null}
        {nothing && needle ? (
          <Text tone="muted" center style={{ padding: 24 }}>
            {t('camp.noMatch')}
          </Text>
        ) : nothing ? (
          <EmptyState
            icon={<Megaphone size={26} color="#fff" />}
            title={t('camp.empty')}
            body={t('camp.emptyBody')}
            action={canCreate ? t('camp.new') : undefined}
            onAction={canCreate ? () => router.push('/(app)/campaigns/new') : undefined}
          />
        ) : null}
        {groups.map(({ g, list }) => (
          <View key={g} style={{ gap: 10 }}>
            <SectionHeader
              title={g === 'scheduled' ? t('camp.state.scheduled') : g === 'today' ? t('common.today') : g === 'week' ? t('camp.thisWeek') : t('camp.earlier')}
            />
            {/* Desktop: two cards a row. */}
            <View style={desktop ? styles.grid : { gap: 10 }}>
              {list.map((c) => (
                <View key={c.id} style={desktop ? styles.cell : undefined}>
                  <CampaignCard campaign={c} />
                </View>
              ))}
            </View>
          </View>
        ))}
        {q.hasNextPage ? <Button variant="secondary" title={t('common.loadMore')} loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} /> : null}
      </View>
    </Screen>
  );
}

const open = (id: string) => router.push({ pathname: '/(app)/campaigns/[id]', params: { id } });

function CampaignCard({ campaign: c }: { campaign: Campaign }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const stateColor = useStateColor();
  const state = campaignState(c);
  const when = shownAt(c);
  return (
    <Pressable onPress={() => open(c.id)}>
      <Card style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }} gap={8}>
          <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
            {c.name}
          </Text>
          <StatusPill label={t(`camp.state.${state}`)} color={stateColor(state)} />
        </Row>
        <Row gap={14} style={{ flexWrap: 'wrap' }}>
          <Row gap={4}>
            <CalendarClock size={13} color={state === 'scheduled' ? colors.warning : colors.textMuted} />
            <Text variant="caption" tone={state === 'scheduled' ? 'default' : 'muted'}>
              {state === 'scheduled' && c.scheduledAt ? t('camp.sendsAt', { when: fmt(c.scheduledAt) }) : fmt(when)}
            </Text>
          </Row>
          {c.isRepeating && c.repeat ? (
            <Row gap={4}>
              <Repeat size={13} color={colors.textMuted} />
              <Text variant="caption" tone="muted">
                {t(`camp.rep.${c.repeat.unit}`, { defaultValue: c.repeat.unit })}
              </Text>
            </Row>
          ) : null}
          {c.receivers ? (
            <Row gap={4}>
              <Users size={13} color={colors.textMuted} />
              <Text variant="caption" tone="muted">
                {t('camp.recipients', { count: c.receivers })}
              </Text>
            </Row>
          ) : null}
          {c.type === 'retarget' ? (
            <Text variant="caption" tone="primary">
              {t('camp.retargetTag')}
            </Text>
          ) : null}
        </Row>
        {state === 'sending' || state === 'completed' ? <Results id={c.id} live={state === 'sending'} /> : null}
        {c.error ? (
          <Text variant="caption" tone="danger" numberOfLines={2}>
            {c.error}
          </Text>
        ) : null}
        {state === 'draft' ? (
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button size="sm" variant="secondary" title={t('camp.continue')} onPress={() => open(c.id)} />
          </Row>
        ) : null}
      </Card>
    </Pressable>
  );
}

/**
 * Sent → delivered → read → replied, as shares of what was sent. One request
 * per card, made only for cards on screen; finished campaigns' results are
 * kept on the device (see contactsCache), so they show at once and refresh now and then.
 */
function Results({ id, live }: { id: string; live: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const q = useQuery({
    queryKey: campaignKeys.stats(id),
    queryFn: () => campaignStats(id),
    // While sending: every 30 s. Finished: reads and replies still come in for a while, so the
    // counts are refreshed when older than 10 minutes (the saved copy shows meanwhile).
    staleTime: live ? 30_000 : 10 * 60_000,
    refetchInterval: live ? 30_000 : false,
  });
  const s = q.data;
  if (!s?.total) return null;
  const pct = (n: number) => (s.sent ? Math.round((n * 100) / s.sent) : 0);
  const cols = [
    { key: 'sent', value: String(s.sent), share: s.total ? Math.round((s.sent * 100) / s.total) : 0, color: colors.textMuted },
    { key: 'delivered', value: `${pct(s.delivered)}%`, share: pct(s.delivered), color: colors.primary },
    { key: 'read', value: `${pct(s.read)}%`, share: pct(s.read), color: colors.success },
    { key: 'replied', value: `${pct(s.replied)}%`, share: pct(s.replied), color: colors.warning },
  ];
  return (
    <View style={{ gap: 6 }}>
      <Row gap={10}>
        {cols.map((c) => (
          <View key={c.key} style={{ flex: 1, gap: 3 }}>
            <Text variant="bodyStrong">{c.value}</Text>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}>
              <View style={{ width: `${c.share}%`, height: 4, backgroundColor: c.color }} />
            </View>
            <Text variant="micro" tone="muted" numberOfLines={1}>
              {t(`camp.stat.${c.key}`)}
            </Text>
          </View>
        ))}
      </Row>
      {s.failed ? (
        <Text variant="caption" tone="danger">
          {`${t('camp.stat.failed')}: ${s.failed}`}
        </Text>
      ) : null}
    </View>
  );
}

/** Members whose role can't open this page get a short explanation instead. */
export default function CampaignsScreenGate() {
  return (
    <RequireCan any={[P.campaigns.list]}>
      <CampaignsScreen />
    </RequireCan>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  cell: { width: '49.2%' },
});
