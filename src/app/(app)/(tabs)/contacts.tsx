/**
 * Leads. Hero with count and an overlapping search; status tabs; clean rows
 * with a WhatsApp button; long-press to multi-select for Assign / Campaign.
 * The ⋯ menu adds contacts from the phone, a sheet, or opens the trash.
 */
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Columns3, Contact, FileUp, ListFilter, Megaphone, MessageCircle, MoreHorizontal, PencilLine, Trash2, UserPlus, Users, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { BulkEditSheet } from '@/components/leads/BulkEditSheet';
import { ContactTypeBar, ContactTypeSelect } from '@/components/leads/ContactTypeBar';
import { FilterSheet } from '@/components/leads/FilterSheet';
import { GetStarted } from '@/components/leads/GetStarted';
import { SetupBanner } from '@/components/SetupBanner';
import { LeadCard } from '@/components/leads/LeadCard';
import { LeadTableHeader, LeadTableRow } from '@/components/leads/LeadTable';
import { useDesktop } from '@/hooks/useDesktop';
import { TAB_BAR_SPACE } from '@/components/navigation/FloatingTabBar';
import { Button, Chip, EmptyState, GroupRow, Hero, HeroButton, Loading, Row, SearchField, Sheet, Text, UnderlineTabs } from '@/components/ui';
import { flatLeads, useLeads, useLeadOptions, useSegments, useTags } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { buildContactFilter, countActiveFilters, type LeadFilter } from '@/lib/filters';
import { eachLimited } from '@/lib/pool';
import { P } from '@/lib/permissions';
import { trashLead, type Lead } from '@/services/crm/leads';
import { dueTaskCounts } from '@/services/crm/waTasks';
import { confirmAction, showAlert } from '@/lib/dialog';
import { F, type LeadStatus } from '@/services/crm/schema';
import { useAccountsStore } from '@/stores/accounts';
import { useFeatures } from '@/stores/features';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { useCan, useCanAll, useCanAny } from '@/stores/auth';
import { RequireCan } from '@/components/RequireCan';

type Tab = 'all' | 'due' | 'new' | 'never' | string;

function LeadsScreen() {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  const [tab, setTab] = useState<Tab>('all');
  const [filter, setFilter] = useState<LeadFilter>({});
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // What the role allows here (owners: everything).
  const can = {
    create: useCan(P.contacts.create),
    update: useCan(P.contacts.update),
    delete: useCan(P.contacts.delete),
    trash: useCanAny([P.contacts.update, P.contacts.delete]),
    campaign: useCan(P.campaigns.create),
    import: useCanAll([P.contacts.create, P.app.importLeads]),
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const options = useLeadOptions();
  const tags = useTags();
  const segments = useSegments();

  const [contactType, setContactType] = useState('');
  const desktop = useDesktop();
  // One request once typing pauses, not one per key.
  const query = useDebounced(search.trim(), 300);
  const effective = useMemo<LeadFilter>(() => {
    const f: LeadFilter = { ...filter, search: query || undefined, contactTypes: contactType ? [contactType] : undefined };
    if (tab === 'due') f.due = 'today';
    else if (tab !== 'all') f.statuses = [tab as LeadStatus];
    return f;
  }, [filter, query, tab, contactType]);
  // Fields the server's 50-condition limit narrowed to their first choice: the list is not everything picked.
  const collapsed = useMemo(() => buildContactFilter(effective).collapsed, [effective]);

  const leads = useLeads(effective);
  const items = useMemo(() => flatLeads(leads.data?.pages), [leads.data]);
  const total = leads.data?.pages[0]?.total ?? 0;
  const activeCount = countActiveFilters(filter);
  const selecting = selected.size > 0;
  const narrowed = activeCount > 0 || !!search || tab !== 'all' || !!contactType;
  const waApi = useWhatsAppConfig().mode === 'api';

  const qc = useQueryClient();
  // Follow-up messages to send with the WhatsApp app (phone mode series).
  const followupsOn = useFeatures().followups;
  const waTasks = useQuery({ queryKey: ['waTasks', 'counts'], queryFn: dueTaskCounts, staleTime: 60_000, enabled: followupsOn });
  // Moves the selected leads to the trash (restorable from Leads → Trash).
  const deleteSelected = async () => {
    const ids = [...selected];
    const ok = await confirmAction({
      title: t('trash.deleteManyQ', { count: ids.length }),
      message: t('trash.deleteLeadBody'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    // A few at a time: hundreds at once run into the gateway's rate limit.
    const failed = await eachLimited(ids, (id) => trashLead(id));
    setSelected(new Set());
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['board'] });
    if (failed) showAlert(t('trash.someFailed', { count: failed }));
  };

  // Stable, so memoised rows don't all re-render on every tick.
  const toggle = useCallback(
    (id: string) =>
      setSelected((cur) => {
        const next = new Set(cur);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  const fieldName = (slug: string) =>
    slug === F.status ? t('common.status') : slug === F.contactType ? t('leads.contactType') : slug === F.assignedName ? t('filter.assignedTo') : slug;

  const tabs = [
    { value: 'all', label: t('common.all') },
    { value: 'due', label: t('leads.dueToday') },
    ...options.statuses.map((s) => ({
      value: s,
      label: t(`status.${s}`, { defaultValue: s }),
    })),
  ];

  const header = (
    <View>
      <Hero
        title={t('leads.title')}
        subtitle={leads.isLoading ? t('common.loading') : narrowed ? t('leads.matching', { count: total }) : t('leads.total', { count: total })}
        right={
          <Row gap={8}>
            {/* A campaign to the list on screen (its filters and type); desktop has it beside the type bar. */}
            {waApi && can.campaign && !desktop && items.length ? (
              <HeroButton
                label={t('camp.short')}
                onPress={() => router.push({ pathname: '/(app)/campaigns/new', params: { filter: JSON.stringify(effective) } })}
              >
                <Megaphone size={18} color="#fff" />
              </HeroButton>
            ) : null}
            {/* The same contacts as a board of stages (it had its own tab). */}
            {desktop ? null : (
              <HeroButton label={t('tabs.board')} onPress={() => router.push('/(app)/(tabs)/board')}>
                <Columns3 size={18} color="#fff" />
              </HeroButton>
            )}
            {can.create ? (
              <HeroButton label={t('leads.addLead')} onPress={() => router.push('/(app)/lead/new')}>
                <UserPlus size={18} color="#fff" />
              </HeroButton>
            ) : null}
            {/* Used now and then: kept off the header's main row. */}
            {can.import || can.trash || (can.create && Platform.OS !== 'web') ? (
              <HeroButton label={t('leads.moreActions')} onPress={() => setMenuOpen(true)}>
                <MoreHorizontal size={18} color="#fff" />
              </HeroButton>
            ) : null}
          </Row>
        }
        overlap={
          <Row gap={10}>
            <View style={{ flex: 1 }}>
              <SearchField value={search} onChangeText={setSearch} placeholder={t('leads.searchPlaceholder')} elevated />
            </View>
            <Pressable
              onPress={() => setShowFilter(true)}
              accessibilityRole="button"
              accessibilityLabel={t('filter.title')}
              style={({ pressed }) => [
                styles.filterBtn,
                {
                  backgroundColor: activeCount ? colors.primarySoft : pressed ? colors.surfacePressed : colors.surfaceAlt,
                  borderRadius: radius.md,
                },
              ]}
            >
              <ListFilter size={19} color={activeCount ? colors.primary : colors.text} />
              {activeCount ? (
                <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                  <Text variant="micro" style={{ color: '#fff' }}>
                    {activeCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </Row>
        }
      />
      <SetupBanner style={{ marginHorizontal: 16, marginTop: 14 }} />
      {(waTasks.data?.today ?? 0) + (waTasks.data?.overdue ?? 0) > 0 ? (
        <Pressable onPress={() => router.push('/(app)/wa-tasks')} style={[styles.waCard, { backgroundColor: colors.successSoft, borderRadius: radius.md }]}>
          <MessageCircle size={18} color={colors.success} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {t('waTasks.card', { count: (waTasks.data?.today ?? 0) + (waTasks.data?.overdue ?? 0) })}
          </Text>
          {waTasks.data?.overdue ? (
            <Text variant="caption" tone="danger" style={{ fontWeight: '700' }}>
              {t('waTasks.overdueN', { count: waTasks.data.overdue })}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
      <View style={{ marginTop: 12 }}>
        {desktop ? (
          // Desktop: the list's actions sit beside the type slider instead of floating over rows.
          <Row gap={8} style={{ paddingEnd: 16, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <ContactTypeBar value={contactType} onChange={setContactType} />
            </View>
            {waApi && can.campaign && items.length ? (
              <Button
                title={t('camp.short')}
                size="sm"
                variant="secondary"
                icon={<Megaphone size={14} color={colors.primary} />}
                onPress={() => router.push({ pathname: '/(app)/campaigns/new', params: { filter: JSON.stringify(effective) } })}
              />
            ) : null}
          </Row>
        ) : (
          // Phones: type picker and stage tabs share one row, so the first contact sits higher.
          <Row gap={0} style={{ alignItems: 'center' }}>
            <View style={{ paddingStart: 16 }}>
              <ContactTypeSelect value={contactType} onChange={setContactType} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <UnderlineTabs value={tab} options={tabs} onChange={setTab} />
            </View>
          </Row>
        )}
      </View>
      {desktop ? (
        <View style={{ marginTop: 6 }}>
          <UnderlineTabs value={tab} options={tabs} onChange={setTab} />
        </View>
      ) : null}
      {filter.segment || filter.tags?.length ? (
        <Row gap={6} style={styles.activeFilters}>
          {filter.segment ? (
            <Chip
              label={segments.data?.find((s) => s.id === filter.segment)?.name ?? filter.segment}
              tone="accent"
              onPress={() => setFilter((f) => ({ ...f, segment: undefined }))}
              icon={<X size={12} color={colors.accent} />}
            />
          ) : null}
          {filter.tags?.map((id) => (
            <Chip
              key={id}
              label={tags.data?.find((tg) => tg.id === id)?.name ?? 'tag'}
              onPress={() =>
                setFilter((f) => ({
                  ...f,
                  tags: f.tags?.filter((x) => x !== id),
                }))
              }
              icon={<X size={12} color={colors.textMuted} />}
            />
          ))}
        </Row>
      ) : null}
      {collapsed.length ? (
        <Text variant="caption" tone="warning" style={styles.notice}>
          {t('filter.narrowed', {
            defaultValue: 'Too many choices to combine: only the first {{fields}} picked is used. Pick fewer to see everything.',
            fields: collapsed.map(fieldName).join(', '),
          })}
        </Text>
      ) : null}
      <View style={{ height: 10 }} />
      {desktop && items.length ? (
        <LeadTableHeader
          allSelected={items.length > 0 && items.every((l) => selected.has(l.id))}
          onSelectAll={() => setSelected(items.every((l) => selected.has(l.id)) ? new Set() : new Set(items.map((l) => l.id)))}
        />
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlashList<Lead>
        data={items}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) =>
          desktop ? (
            <LeadTableRow lead={item} selecting={selecting} selected={selected.has(item.id)} onSelect={toggle} />
          ) : (
            <View style={[styles.rowWrap, { backgroundColor: colors.surface }]}>
              <LeadCard lead={item} selecting={selecting} selected={selected.has(item.id)} onSelect={toggle} />
            </View>
          )
        }
        ListHeaderComponent={header}
        onEndReached={() => leads.hasNextPage && !leads.isFetchingNextPage && leads.fetchNextPage()}
        onEndReachedThreshold={0.6}
        ListFooterComponent={leads.isFetchingNextPage ? <Loading /> : <View style={{ height: TAB_BAR_SPACE + 80 }} />}
        ListEmptyComponent={
          leads.isLoading ? (
            <Loading label={t('common.loading')} />
          ) : leads.isError ? (
            <EmptyState
              title={t('leads.loadFailed')}
              body={String((leads.error as Error)?.message ?? '')}
              action={t('common.retry')}
              onAction={() => void leads.refetch()}
            />
          ) : narrowed ? (
            <EmptyState
              icon={<Users size={26} />}
              title={t('leads.noMatchTitle')}
              body={t('leads.noMatchBody')}
              action={t('leads.clearFilters')}
              onAction={() => {
                setFilter({});
                setSearch('');
                setTab('all');
                setContactType('');
              }}
            />
          ) : (
            // First run: every way to get contacts in, not just one button.
            <GetStarted canCreate={can.create} canImport={can.import} />
          )
        }
        refreshing={leads.isRefetching && !leads.isFetchingNextPage}
        onRefresh={() => void leads.refetch()}
        showsVerticalScrollIndicator={false}
      />

      {selecting ? (
        <View
          style={[
            styles.bulkBar,
            shadow.floating,
            { backgroundColor: colors.surface, bottom: TAB_BAR_SPACE + 12 },
            desktop && { start: undefined, width: 640, alignSelf: 'center' },
          ]}
        >
          {/* Two rows: on a phone one row squeezed the count into a sliver and stretched the bar. */}
          <Row gap={10}>
            <Pressable onPress={() => setSelected(new Set())} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <X size={20} color={colors.textMuted} />
            </Pressable>
            <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {t('leads.selected', { count: selected.size })}
            </Text>
            {can.delete ? (
              <Pressable
                onPress={() => void deleteSelected()}
                hitSlop={8}
                style={{ padding: 6 }}
                accessibilityRole="button"
                accessibilityLabel={t('common.delete')}
              >
                <Trash2 size={18} color={colors.danger} />
              </Pressable>
            ) : null}
          </Row>
          <Row gap={8}>
            {/* Change type / status / fields / tags, or assign, on all selected. */}
            {can.update ? (
              <Button
                title={t('bulk.edit')}
                size="sm"
                variant="secondary"
                style={styles.bulkBtn}
                onPress={() => setAssignOpen(true)}
                icon={<PencilLine size={14} color={colors.primary} />}
              />
            ) : null}
            {waApi && can.campaign ? (
              <Button
                title={t('camp.short')}
                size="sm"
                variant="secondary"
                style={styles.bulkBtn}
                icon={<Megaphone size={14} color={colors.primary} />}
                onPress={() => router.push({ pathname: '/(app)/campaigns/new', params: { leadIds: [...selected].join(',') } })}
              />
            ) : null}
          </Row>
        </View>
      ) : null}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('leads.title')}>
        <View style={[styles.menu, { borderColor: colors.border, borderRadius: radius.lg }]}>
          {/* Optional: bring in the phone's address book (the phone app only). */}
          {can.create && Platform.OS !== 'web' ? (
            <GroupRow
              last={!can.import && !can.trash}
              icon={<Contact size={18} />}
              tint={colors.primary}
              title={t('syncContacts.title')}
              subtitle={t('syncContacts.moreSub')}
              onPress={() => {
                setMenuOpen(false);
                router.push('/(app)/sync/contacts');
              }}
            />
          ) : null}
          {can.import ? (
            <GroupRow
              last={!can.trash}
              icon={<FileUp size={18} />}
              tint={colors.primary}
              title={t('more.import')}
              subtitle={t('more.importSub')}
              onPress={() => {
                setMenuOpen(false);
                router.push('/(app)/import');
              }}
            />
          ) : null}
          {can.trash ? (
            <GroupRow
              last
              icon={<Trash2 size={18} />}
              tint={colors.primary}
              title={t('trash.title')}
              subtitle={t('more.trashSub')}
              onPress={() => {
                setMenuOpen(false);
                router.push('/(app)/trash');
              }}
            />
          ) : null}
        </View>
      </Sheet>

      <FilterSheet
        open={showFilter}
        value={filter}
        onClose={() => setShowFilter(false)}
        onApply={(f) => {
          setFilter(f);
          setShowFilter(false);
        }}
      />
      {assignOpen ? (
        <BulkEditSheet
          ids={[...selected]}
          leads={items.filter((l) => selected.has(l.id))}
          onClose={(changed) => {
            setAssignOpen(false);
            if (changed) setSelected(new Set());
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  filterBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    end: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  activeFilters: { flexWrap: 'wrap', paddingHorizontal: 16, marginTop: 12 },
  notice: { paddingHorizontal: 16, marginTop: 10 },
  rowWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 18,
    overflow: 'hidden',
  },
  bulkBar: {
    position: 'absolute',
    start: 16,
    end: 16,
    borderRadius: 22,
    padding: 12,
    paddingStart: 16,
    gap: 10,
  },
  bulkBtn: { flex: 1 },
  waCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 14, padding: 12 },
  menu: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});

/** Members whose role can't open this page get a short explanation instead. */
export default function LeadsScreenGate() {
  return (
    <RequireCan any={[P.contacts.list]}>
      <LeadsScreenForAccount />
    </RequireCan>
  );
}

// Keyed by account: a selection, filters (segment and tag ids) or tab from one account never carry over to another.
function LeadsScreenForAccount() {
  const acct = useAccountsStore((st) => st.activeId);
  return <LeadsScreen key={acct ?? 'none'} />;
}
