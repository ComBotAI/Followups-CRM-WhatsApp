/**
 * Reports: a day, week or month at a glance (stepped back with the arrows).
 * Revenue split by new and returning guests against the period before, visit
 * numbers, the reminders that went out and the guests they brought back, a
 * bar per hour / day, and the top services and team members.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, MessageCircle, Repeat } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { RequireCan } from '@/components/RequireCan';
import { useNow } from '@/hooks/useNow';
import { Card, EmptyState, Row, Screen, SegmentedControl, Skeleton, Text } from '@/components/ui';
import { formatCompact } from '@/lib/money';
import { P } from '@/lib/permissions';
import { BROUGHT_BACK_DAYS, change, rangeOf, type Breakdown, type Bucket, type Period, type Range, type Report } from '@/lib/reports';
import { rtlFlip } from '@/lib/rtl';
import { dayjs } from '@/lib/time';
import { loadReport } from '@/services/crm/reports';
import { useTheme } from '@/theme/ThemeProvider';

/** Fixed series colours (an account theme may change `primary`; the chart's meaning must not move). Checked for colour-blind separation and contrast on both surfaces. */
const SERIES = {
  light: { returning: '#2450DB', new: '#C2410C' },
  dark: { returning: '#5B82FF', new: '#FB923C' },
} as const;

const compact = formatCompact;
const money = formatCompact;

const useSeries = () => SERIES[useTheme().colors.scheme];

/** "Today", "Last week", "March 2026"… */
const usePeriodLabel = (period: Period, offset: number, range: Range) => {
  const { t } = useTranslation();
  if (offset === 0) return t(`reports.this.${period}`);
  if (offset === -1) return t(`reports.last.${period}`);
  if (period === 'day') return dayjs(range.from).format('ddd, D MMM');
  if (period === 'week') return `${dayjs(range.from).format('D MMM')} – ${dayjs(range.to.getTime() - 1).format('D MMM')}`;
  return dayjs(range.from).format('MMMM YYYY');
};

/** ▲ 12% / ▼ 8%: an arrow as well as a colour. */
function Change({ now, before, period }: { now: number; before: number; period: Period }) {
  const { t } = useTranslation();
  const pct = change(now, before);
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <Text variant="caption" tone={pct === 0 ? 'muted' : up ? 'success' : 'danger'} numberOfLines={1}>
      {t(`reports.vs.${period}`, { change: `${up ? '▲' : '▼'} ${Math.abs(pct)}%` })}
    </Text>
  );
}

function Legend() {
  const { t } = useTranslation();
  const s = useSeries();
  return (
    <Row gap={14} style={{ flexWrap: 'wrap' }}>
      {[
        { color: s.new, label: t('reports.newGuests') },
        { color: s.returning, label: t('reports.returningGuests') },
      ].map((x) => (
        <Row key={x.label} gap={6}>
          <View style={[styles.swatch, { backgroundColor: x.color }]} />
          <Text variant="caption" tone="muted">
            {x.label}
          </Text>
        </Row>
      ))}
    </Row>
  );
}

/** Revenue, its new / returning split as one bar, and the change from the period before. */
function RevenueCard({ r, period }: { r: Report; period: Period }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useSeries();
  const newShare = r.revenue ? r.newRevenue / r.revenue : 0;
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Text variant="caption" tone="muted">
          {t('reports.revenue')}
        </Text>
        <Text variant="display" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
          {money(r.revenue)}
        </Text>
        <Change now={r.revenue} before={r.previous.revenue} period={period} />
      </View>
      {r.revenue ? (
        <View style={[styles.split, { backgroundColor: colors.surfaceAlt }]}>
          {newShare > 0 ? <View style={{ flex: newShare, backgroundColor: s.new }} /> : null}
          {newShare > 0 && newShare < 1 ? <View style={{ width: 2, backgroundColor: colors.surface }} /> : null}
          {newShare < 1 ? <View style={{ flex: 1 - newShare, backgroundColor: s.returning }} /> : null}
        </View>
      ) : null}
      <Row gap={12}>
        <SplitFigure color={s.new} label={t('reports.newGuests')} amount={r.newRevenue} visits={r.newVisits} />
        <SplitFigure color={s.returning} label={t('reports.returningGuests')} amount={r.returningRevenue} visits={r.returningVisits} />
      </Row>
    </Card>
  );
}

function SplitFigure({ color, label, amount, visits }: { color: string; label: string; amount: number; visits: number }) {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Row gap={6}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </Row>
      <Text variant="h2" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {money(amount)}
      </Text>
      <Text variant="caption" tone="faint">
        {t('reports.visitsN', { count: visits })}
      </Text>
    </View>
  );
}

/** Visits, guests, average: one quiet strip, two by two. */
function Stats({ r, period }: { r: Report; period: Period }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const cells = [
    { label: t('reports.visits'), value: String(r.visits), extra: <Change now={r.visits} before={r.previous.visits} period={period} /> },
    { label: t('reports.guests'), value: String(r.guests) },
    { label: t('reports.average'), value: money(r.average) },
    { label: t('reports.newVsReturning'), value: `${r.newVisits} / ${r.returningVisits}` },
  ];
  return (
    <View style={[styles.stats, { borderColor: colors.border, borderRadius: radius.lg }]}>
      {cells.map((c, i) => (
        <View
          key={c.label}
          style={[
            styles.stat,
            i % 2 === 1 && { borderStartWidth: StyleSheet.hairlineWidth, borderStartColor: colors.border },
            i >= 2 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
          ]}
        >
          <Text variant="h1" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
            {c.value}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {c.label}
          </Text>
          {c.extra}
        </View>
      ))}
    </View>
  );
}

/** What the reminders did: how many went out, and the visits that followed one. */
function RemindersCard({ r }: { r: Report }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card style={{ gap: 14 }}>
      <Row gap={12}>
        <View style={[styles.icon, { backgroundColor: colors.whatsappSoft }]}>
          <MessageCircle size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">
            {t('reports.remindersSent')}
          </Text>
          <Text variant="h2" style={{ fontVariant: ['tabular-nums'] }}>
            {r.remindersSent}
          </Text>
        </View>
      </Row>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <Repeat size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" tone="muted">
            {t('reports.broughtBack')}
          </Text>
          <Text variant="h2" style={{ fontVariant: ['tabular-nums'] }}>
            {t('reports.visitsN', { count: r.broughtBack })}
            {r.broughtBackRevenue ? ` · ${money(r.broughtBackRevenue)}` : ''}
          </Text>
          <Text variant="caption" tone="faint">
            {t('reports.broughtBackSub', { days: BROUGHT_BACK_DAYS })}
          </Text>
        </View>
      </Row>
    </Card>
  );
}

const CHART_H = 140;
const SEG_GAP = 2;

/** One bar per hour (a day) or day (a week / month): revenue stacked new under returning, or visits when no prices are recorded. Tap a bar for its numbers. */
function Chart({ r, period }: { r: Report; period: Period }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useSeries();
  const [picked, setPicked] = useState<number | null>(null);
  const byRevenue = r.revenue > 0;
  const value = (b: Bucket) => (byRevenue ? b.newRevenue + b.returningRevenue : b.visits);
  const max = Math.max(1, ...r.buckets.map(value));
  const label = (b: Bucket, i: number) => {
    if (period === 'day') return i % 6 === 0 ? dayjs(b.from).format('HH:mm') : '';
    if (period === 'week') return dayjs(b.from).format('dd');
    return i % 7 === 0 ? String(b.from.getDate()) : '';
  };
  const sel = picked !== null ? r.buckets[picked] : null;
  const selWhen = sel ? (period === 'day' ? `${dayjs(sel.from).format('HH:mm')}–${dayjs(sel.to).format('HH:mm')}` : dayjs(sel.from).format('ddd, D MMM')) : '';
  const gap = r.buckets.length > 20 ? 2 : 6;

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Text variant="bodyStrong">{t(byRevenue ? `reports.chart.revenue.${period === 'day' ? 'hour' : 'day'}` : `reports.chart.visits.${period === 'day' ? 'hour' : 'day'}`)}</Text>
        {/* The tapped bar's numbers, or how to get them. */}
        <Text variant="caption" tone={sel ? 'default' : 'faint'} numberOfLines={2}>
          {sel
            ? [
                selWhen,
                t('reports.visitsN', { count: sel.visits }),
                byRevenue ? `${t('reports.newGuests')} ${money(sel.newRevenue)} · ${t('reports.returningGuests')} ${money(sel.returningRevenue)}` : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : t('reports.chartHint')}
        </Text>
      </View>
      <View style={[styles.plot, { height: CHART_H, borderBottomColor: colors.borderStrong }]}>
        {[0.5, 1].map((f) => (
          <View key={f} pointerEvents="none" style={[styles.grid, { bottom: CHART_H * f - 1, borderTopColor: colors.border }]} />
        ))}
        <Text variant="micro" tone="faint" style={styles.maxLabel} pointerEvents="none">
          {byRevenue ? compact(max) : max}
        </Text>
        <Row style={{ flex: 1, alignItems: 'flex-end' }} gap={gap}>
          {r.buckets.map((b, i) => {
            const total = value(b);
            const h = total ? Math.max(3, (total / max) * CHART_H) : 0;
            const newShareH = byRevenue && total ? (b.newRevenue / total) * h : 0;
            // A sliver under the gap is dropped rather than drawn at a negative height.
            const rawRet = h - newShareH;
            const both = newShareH > 0 && rawRet > SEG_GAP;
            const retH = both ? rawRet - SEG_GAP : newShareH > 0 ? 0 : rawRet;
            const newH = both ? newShareH : newShareH > 0 ? h : 0;
            const active = picked === i;
            const dim = picked !== null && !active;
            return (
              <Pressable
                key={b.from.toISOString()}
                onPress={() => setPicked(active ? null : i)}
                accessibilityRole="button"
                accessibilityLabel={`${dayjs(b.from).format(period === 'day' ? 'HH:mm' : 'ddd D MMM')}: ${t('reports.visitsN', { count: b.visits })}${byRevenue ? `, ${money(total)}` : ''}`}
                style={{ flex: 1, height: CHART_H, justifyContent: 'flex-end', opacity: dim ? 0.45 : 1 }}
              >
                {byRevenue ? (
                  <>
                    {/* Returning on top of new, a 2px gap between when both show. */}
                    {retH > 0 ? <View style={[styles.barTop, { height: retH, backgroundColor: s.returning }]} /> : null}
                    {retH > 0 && newH > 0 ? <View style={{ height: SEG_GAP }} /> : null}
                    {newH > 0 ? <View style={[retH > 0 ? null : styles.barTop, { height: newH, backgroundColor: s.new }]} /> : null}
                  </>
                ) : h ? (
                  <View style={[styles.barTop, { height: h, backgroundColor: s.returning }]} />
                ) : null}
              </Pressable>
            );
          })}
        </Row>
      </View>
      <Row gap={gap}>
        {r.buckets.map((b, i) => (
          <Text key={b.from.toISOString()} variant="micro" tone="faint" numberOfLines={1} style={{ flex: 1, overflow: 'visible' }}>
            {label(b, i)}
          </Text>
        ))}
      </Row>
      {byRevenue ? <Legend /> : null}
    </Card>
  );
}

/** Top services / team members: name, visits, revenue, and a thin bar for share. */
function BreakdownCard({ title, rows }: { title: string; rows: Breakdown[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!rows.length) return null;
  const shown = rows.slice(0, 8);
  const byRevenue = shown.some((x) => x.revenue > 0);
  const max = Math.max(1, ...shown.map((x) => (byRevenue ? x.revenue : x.visits)));
  return (
    <Card style={{ gap: 12 }}>
      <Text variant="bodyStrong">{title}</Text>
      {shown.map((x) => (
        <View key={x.key} style={{ gap: 6 }}>
          <Row gap={8}>
            <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
              {x.name}
            </Text>
            <Text variant="caption" tone="muted">
              {t('reports.visitsN', { count: x.visits })}
            </Text>
            {byRevenue ? (
              <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'], minWidth: 56, textAlign: 'right' }}>
                {money(x.revenue)}
              </Text>
            ) : null}
          </Row>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.fill, { width: `${((byRevenue ? x.revenue : x.visits) / max) * 100}%`, backgroundColor: colors.primary }]} />
          </View>
        </View>
      ))}
    </Card>
  );
}

function ReportsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  // The period is worked out once per choice, so it doesn't drift while the screen stays open.
  // Re-worked out when the day turns, so a screen left open overnight moves on to the new "Today".
  const day = new Date(useNow(60_000)).toDateString();
  const { range, previous } = useMemo(
    () => ({ range: rangeOf(period, offset), previous: rangeOf(period, offset - 1) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `day` is the trigger
    [period, offset, day],
  );
  const report = useQuery({
    // The fetch reads exactly the dates in the key and the label, even if the screen stays open past midnight.
    queryKey: ['visits', 'report', period, range.from.toISOString()],
    queryFn: () => loadReport(period, range, previous),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const label = usePeriodLabel(period, offset, range);
  const r = report.data;

  return (
    <Screen title={t('reports.title')} subtitle={t('reports.sub')} back scroll onRefresh={() => report.refetch()} maxWidth={720}>
      <View style={{ gap: 14 }}>
        <SegmentedControl<Period>
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setOffset(0);
          }}
          options={[
            { value: 'day', label: t('reports.period.day') },
            { value: 'week', label: t('reports.period.week') },
            { value: 'month', label: t('reports.period.month') },
          ]}
        />
        <Row gap={8} style={{ justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => setOffset((o) => o - 1)}
            hitSlop={8}
            style={[styles.step, { backgroundColor: colors.surfaceAlt }]}
            accessibilityRole="button"
            accessibilityLabel={t('reports.prev')}
          >
            <ChevronLeft size={18} color={colors.text} style={rtlFlip()} />
          </Pressable>
          <Row gap={8}>
            <Text variant="bodyStrong">{label}</Text>
            {report.isFetching && r ? <ActivityIndicator size="small" color={colors.textFaint} /> : null}
          </Row>
          <Pressable
            onPress={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset >= 0}
            hitSlop={8}
            style={[styles.step, { backgroundColor: colors.surfaceAlt, opacity: offset >= 0 ? 0.35 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('reports.next')}
          >
            <ChevronRight size={18} color={colors.text} style={rtlFlip()} />
          </Pressable>
        </Row>

        {!r && report.isLoading ? (
          <View style={{ gap: 14 }}>
            <Skeleton h={170} />
            <Skeleton h={140} />
            <Skeleton h={200} />
          </View>
        ) : null}
        {!r && report.isError ? <EmptyState title={t('reports.failed')} action={t('common.retry')} onAction={() => void report.refetch()} /> : null}

        {r ? (
          <View style={{ gap: 14, opacity: report.isPlaceholderData ? 0.5 : 1 }}>
            {r.capped ? (
              <Text variant="caption" tone="warning">
                {t('reports.capped')}
              </Text>
            ) : null}
            {/* Drawn as the period the numbers belong to (while a new period loads, the last one stays up, dimmed). */}
            <RevenueCard r={r} period={r.period} />
            <Stats r={r} period={r.period} />
            <RemindersCard r={r} />
            {r.visits ? (
              <>
                <Chart key={`${r.period}${r.buckets[0]?.from.toISOString()}`} r={r} period={r.period} />
                <BreakdownCard title={t('reports.services')} rows={r.services} />
                <BreakdownCard title={t('reports.team')} rows={r.team} />
              </>
            ) : (
              <EmptyState title={t('reports.empty')} body={t('reports.emptyBody')} />
            )}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  split: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  stat: { width: '50%', paddingVertical: 14, paddingHorizontal: 16, gap: 2 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  plot: { borderBottomWidth: StyleSheet.hairlineWidth, position: 'relative' },
  grid: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  maxLabel: { position: 'absolute', top: -2, right: 0 },
  barTop: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});

export default function ReportsScreenGate() {
  return (
    <RequireCan any={[P.app.reports]}>
      <ReportsScreen />
    </RequireCan>
  );
}
