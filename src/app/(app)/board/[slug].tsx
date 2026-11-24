/**
 * One board. Every dropdown field is a board (Status, and dropdown fields the
 * account has); each option is a column. Cards call, WhatsApp, or move the
 * lead to another column.
 */
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ArrowRightLeft, MessageCircle, Phone } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { LeadChips } from '@/components/leads/LeadCard';
import { useBoards, type Board } from '@/hooks/boards';
import { Row, Screen, SegmentedControl, Sheet, Text, useStatusColor } from '@/components/ui';
import { useUpdateLead } from '@/hooks/queries';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { callPhone, messageOnWhatsApp, plainWhatsApp } from '@/lib/actions';
import { showAlert } from '@/lib/dialog';
import { formatPhone } from '@/lib/phone';
import { describeCrmError } from '@/services/crm/client';
import { dropdownPatch, dropdownValue, listLeadsByField, type Lead } from '@/services/crm/leads';
import { DEFAULT_STATUS, F } from '@/services/crm/schema';
import { P } from '@/lib/permissions';
import { useCan } from '@/stores/auth';
import { useTabBarInset } from '@/components/navigation/FloatingTabBar';
import { useTheme } from '@/theme/ThemeProvider';
import { openContact } from '@/stores/contactPanel';
import { LeadTableHeader, LeadTableRow } from '@/components/leads/LeadTable';
import { useDesktop } from '@/hooks/useDesktop';

export default function BoardView() {
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const boards = useBoards();
  const board = boards.find((b) => b.slug === slug) ?? boards[0];
  return (
    <Screen title={board.label} subtitle={t('board.sub')} back padded={false} wide>
      <BoardColumns key={board.slug} board={board} />
    </Screen>
  );
}

function BoardColumns({ board }: { board: Board }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const colWidth = Math.min(320, Math.max(260, width * 0.82));
  const barInset = useTabBarInset();
  // Status: a contact with none is shown as New, so it sits in New (no "Not set" column).
  const isStatus = board.slug === F.status;
  const columns = isStatus ? board.options : [...board.options, ''];
  const dflt = isStatus && board.options.includes(DEFAULT_STATUS) ? DEFAULT_STATUS : undefined;
  const canMove = useCan(P.contacts.update);
  const results = useQueries({
    queries: columns.map((value) => ({
      queryKey: ['board', board.slug, value, dflt ?? ''],
      queryFn: () => listLeadsByField(board.slug, value, 50, dflt),
      staleTime: 30_000,
    })),
  });
  const [moving, setMoving] = useState<Lead | null>(null);
  const qc = useQueryClient();
  const pull = usePullRefresh(() => qc.invalidateQueries({ queryKey: ['board', board.slug] }));
  const desktop = useDesktop();
  const [view, setView] = useState<'board' | 'list'>('board');
  const { colors } = useTheme();
  const statusColor = useStatusColor();

  const labelOf = (value: string) =>
    value
      ? board.slug === F.status
        ? t(`status.${value}`, { defaultValue: value })
        : value
      : t('board.notSet');

  // Desktop: a list grouped by column, as an alternative to the columns.
  const list =
    desktop && view === 'list' ? (
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <LeadTableHeader allSelected={false} onSelectAll={() => undefined} />
        {columns.map((value, i) => {
          const rows = results[i]?.data?.leads ?? [];
          return (
            <View key={value || '__none'} style={{ marginTop: 14 }}>
              <Row gap={8} style={{ paddingHorizontal: 32, paddingVertical: 6 }}>
                <View style={[styles.dot, { backgroundColor: !value ? colors.textFaint : board.slug === F.status ? statusColor(value) : colors.primary }]} />
                <Text variant="bodyStrong">{labelOf(value)}</Text>
                <Text variant="caption" tone="muted">
                  {results[i]?.data?.total ?? 0}
                </Text>
                {results[i]?.isLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              </Row>
              {rows.map((l) => (
                <LeadTableRow key={l.id} lead={l} selected={false} selecting={false} onSelect={() => undefined} />
              ))}
            </View>
          );
        })}
      </ScrollView>
    ) : null;

  return (
    <>
      {desktop ? (
        <Row gap={8} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <View style={{ width: 240 }}>
            <SegmentedControl
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: t('board.viewBoard') },
                { value: 'list', label: t('board.viewList') },
              ]}
            />
          </View>
        </Row>
      ) : null}
      {list ?? (
        <ScrollView
          horizontal
          snapToInterval={colWidth + 12}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.columns, { paddingBottom: barInset + 28 }]}
        >
          {columns.map((value, i) => (
            <Column
              key={value || '__none'}
              width={colWidth}
              slug={board.slug}
              value={value}
              label={
                value
                  ? board.slug === F.status
                    ? t(`status.${value}`, { defaultValue: value })
                    : value
                  : t('board.notSet')
              }
              leads={results[i]?.data?.leads ?? []}
              total={results[i]?.data?.total ?? 0}
              loading={!!results[i]?.isLoading}
              error={results[i]?.error ? describeCrmError(results[i].error) : null}
              onMove={canMove ? setMoving : undefined}
              refreshing={pull.refreshing}
              onRefresh={() => void pull.onRefresh()}
            />
          ))}
        </ScrollView>
      )}
      {moving ? <MoveSheet lead={moving} board={board} onClose={() => setMoving(null)} /> : null}
    </>
  );
}

function Column({
  width,
  slug,
  value,
  label,
  leads,
  total,
  loading,
  error,
  onMove,
  refreshing,
  onRefresh,
}: {
  width: number;
  slug: string;
  value: string;
  label: string;
  leads: Lead[];
  total: number;
  loading: boolean;
  error: string | null;
  /** Absent when the role cannot change contacts. */
  onMove?: (l: Lead) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const statusColor = useStatusColor();
  const dot = !value ? colors.textFaint : slug === F.status ? statusColor(value) : colors.primary;
  return (
    <View style={[styles.column, { width, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg }]}>
      <Row gap={8} style={styles.colHead}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
        <View style={[styles.count, { backgroundColor: colors.surface }]}>
          <Text variant="caption" tone="muted" style={{ fontWeight: '700' }}>
            {total}
          </Text>
        </View>
      </Row>
      {loading ? <ActivityIndicator color={colors.primary} style={{ padding: 20 }} /> : null}
      {error ? (
        <Text variant="caption" tone="danger" style={{ padding: 12 }}>
          {error}
        </Text>
      ) : null}
      <FlatList
        data={leads}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ gap: 8, padding: 8, paddingBottom: 24 }}
        renderItem={({ item }) => <BoardCard lead={item} onMove={onMove ? () => onMove(item) : undefined} />}
        ListEmptyComponent={
          !loading && !error ? (
            <Text variant="caption" tone="faint" center style={{ padding: 16 }}>
              {t('board.empty')}
            </Text>
          ) : undefined
        }
        ListFooterComponent={
          total > leads.length ? (
            <Text variant="micro" tone="faint" center>
              {t('board.more', { count: total - leads.length })}
            </Text>
          ) : undefined
        }
      />
    </View>
  );
}

function BoardCard({ lead, onMove }: { lead: Lead; onMove?: () => void }) {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  return (
    <Pressable onPress={() => openContact(lead.id)} style={[styles.card, shadow.card, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
      <Text variant="bodyStrong" numberOfLines={1}>
        {lead.name}
      </Text>
      {lead.phone ? (
        <Text variant="caption" tone="muted">
          {formatPhone(lead.phone)}
        </Text>
      ) : null}
      <LeadChips lead={lead} />
      <Row gap={8} style={{ marginTop: 8 }}>
        <CardBtn
          icon={<Phone size={15} color={colors.primary} />}
          label={t('common.call')}
          bg={colors.primarySoft}
          onPress={() => (lead.phone ? void callPhone(lead.phone) : undefined)}
        />
        <CardBtn
          icon={<MessageCircle size={15} color="#128C7E" />}
          label={t('common.whatsapp')}
          bg={colors.whatsappSoft}
          onPress={() => (lead.phone ? messageOnWhatsApp({ phone: lead.phone, leadId: lead.id }) : undefined)}
          onLongPress={plainWhatsApp(lead.phone)}
        />
        {onMove ? <CardBtn icon={<ArrowRightLeft size={15} color={colors.text} />} label={t('board.move')} bg={colors.surfaceAlt} onPress={onMove} /> : null}
      </Row>
    </Pressable>
  );
}

function CardBtn({ icon, label, bg, onPress, onLongPress }: { icon: React.ReactNode; label: string; bg: string; onPress: () => void; onLongPress?: () => void }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} hitSlop={4} style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: pressed ? 0.7 : 1 }]}>
      {icon}
      <Text variant="micro" style={{ fontWeight: '700' }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function MoveSheet({ lead, board, onClose }: { lead: Lead; board: Board; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const update = useUpdateLead();
  const current = dropdownValue(lead, board.slug);
  const [busy, setBusy] = useState<string | null>(null);

  const move = async (value: string) => {
    if (value === current) return onClose();
    setBusy(value);
    try {
      await update.mutateAsync({ lead, input: dropdownPatch(board.slug, value) });
      await qc.invalidateQueries({ queryKey: ['board', board.slug] });
      onClose();
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open onClose={onClose} title={t('board.moveTitle', { name: lead.name })} subtitle={board.label}>
      <View style={{ gap: 8 }}>
        {board.options.map((o) => {
          const on = o === current;
          return (
            <Pressable
              key={o}
              onPress={() => void move(o)}
              style={[styles.option, { borderRadius: radius.md, backgroundColor: on ? colors.primarySoft : colors.surfaceAlt }]}
            >
              <Text variant="bodyStrong" style={{ flex: 1, color: on ? colors.primary : colors.text }}>
                {board.slug === F.status ? t(`status.${o}`, { defaultValue: o }) : o}
              </Text>
              {busy === o ? <ActivityIndicator color={colors.primary} /> : on ? <Text tone="primary">✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  columns: { gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  column: { flex: 1, overflow: 'hidden' },
  colHead: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  count: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  card: { padding: 12, gap: 2 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, borderRadius: 10 },
  option: { flexDirection: 'row', alignItems: 'center', padding: 14 },
});
