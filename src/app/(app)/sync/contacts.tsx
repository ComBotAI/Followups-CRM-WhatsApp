/**
 * Phone contacts → CRM.
 *
 *  - Auto-add: contacts saved on this phone from now on become leads on their own.
 *  - To add: the phone contacts not in the CRM yet. Tick who to add (all are
 *    ticked to start), or skip anyone for good.
 *  - In CRM: already added (or matched to an existing contact by number).
 *  - Skipped: never offered again and never auto-added, until restored.
 *
 * Adding runs in the background for this account (with a notification), so
 * the screen can be left.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Contact as ContactIcon, RotateCcw, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';
import { getPermissionsAsync } from 'expo-contacts';

import { SelectRow } from '@/components/SelectRow';
import { Button, EmptyState, Row, Screen, SearchField, Switch, Text, UnderlineTabs } from '@/components/ui';
import { showAlert } from '@/lib/dialog';
import { formatPhone } from '@/lib/phone';
import {
  autoAddEnabled,
  contactsPermission,
  excludedContacts,
  importContacts,
  importedContacts,
  loadPhoneContacts,
  setAutoAdd,
  skipContacts,
  unskipContacts,
  type PhoneContact,
} from '@/services/contactsSync';
import { runJob, useJobs } from '@/services/work';
import { useAccountsStore } from '@/stores/accounts';
import { useTheme } from '@/theme/ThemeProvider';

type Tab = 'toAdd' | 'inCrm' | 'skipped';

/** A small text action at the end of a row. */
function RowAction({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      style={({ pressed }) => [styles.action, { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceAlt }]}
    >
      {icon}
      <Text variant="caption" style={{ fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SyncContacts() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const acct = useAccountsStore((s) => s.activeId);
  const [permitted, setPermitted] = useState<boolean | null>(null);
  // Denied for good: only the phone's Settings can turn it on.
  const [canAsk, setCanAsk] = useState(true);
  const [contacts, setContacts] = useState<PhoneContact[] | null>(null);
  const [inCrm, setInCrm] = useState<Record<string, string>>(() => importedContacts());
  const [skipped, setSkipped] = useState<Set<string>>(() => excludedContacts());
  // Unticked in "To add" (not added this time, not skipped either).
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [auto, setAuto] = useState(() => autoAddEnabled());
  const [tab, setTab] = useState<Tab>('toAdd');
  const [search, setSearch] = useState('');
  // A running import for this account (it continues if the screen is left).
  const progress = useJobs(acct).find((j) => j.label === t('syncContacts.jobLabel')) ?? null;

  useEffect(() => {
    void contactsPermission().then(setPermitted);
    void getPermissionsAsync()
      .then((r) => setCanAsk(r.canAskAgain))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!permitted) return;
    void loadPhoneContacts()
      .then(setContacts)
      .catch(() => setContacts([]));
  }, [permitted]);

  // Thousands of phone contacts: split once per change, not on every render or keystroke.
  const groups = useMemo(() => {
    const all = contacts ?? [];
    return {
      toAdd: all.filter((c) => !inCrm[c.id] && !skipped.has(c.id)),
      inCrm: all.filter((c) => !!inCrm[c.id]),
      skipped: all.filter((c) => !inCrm[c.id] && skipped.has(c.id)),
    };
  }, [contacts, inCrm, skipped]);
  const chosen = useMemo(() => groups.toAdd.filter((c) => !unticked.has(c.id)), [groups, unticked]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return groups[tab].filter((c) => !q || c.name.toLowerCase().includes(q) || (!!digits && c.phone.includes(digits)));
  }, [groups, tab, search]);

  const toggle = (id: string) =>
    setUnticked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const skip = (ids: string[]) => {
    skipContacts(ids);
    setSkipped(excludedContacts());
  };
  const restore = (ids: string[]) => {
    unskipContacts(ids);
    setSkipped(excludedContacts());
  };

  const add = () => {
    if (!acct || !chosen.length) return;
    const batch = chosen;
    showAlert(t('syncContacts.started'), t('syncContacts.startedBody', { count: batch.length }));
    void runJob(acct, t('syncContacts.jobLabel'), (forAcct, onProgress) => importContacts(batch, onProgress, forAcct))
      .then((r) => {
        if (useAccountsStore.getState().activeId === acct) {
          setInCrm(importedContacts(acct));
          void qc.invalidateQueries({ queryKey: ['leads'] });
        }
        showAlert(t('syncContacts.done'), t('syncContacts.doneBody', { created: r.created, linked: r.linked, failed: r.failed }));
      })
      .catch(() => undefined);
  };

  if (permitted === false) {
    return (
      <Screen title={t('syncContacts.title')} back>
        <EmptyState
          icon={<ContactIcon size={26} />}
          title={t('syncContacts.title')}
          body={t('syncContacts.needPermission')}
          action={canAsk ? t('syncContacts.allow') : t('syncContacts.openSettings')}
          onAction={() => {
            if (!canAsk) return void Linking.openSettings().catch(() => undefined);
            void contactsPermission(true).then(async (ok) => {
              setPermitted(ok);
              if (!ok) setCanAsk((await getPermissionsAsync().catch(() => null))?.canAskAgain ?? false);
            });
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('syncContacts.title')}
      subtitle={t('syncContacts.sub')}
      back
      padded={false}
      footer={
        tab === 'toAdd' && groups.toAdd.length ? (
          <Row gap={10}>
            <Button
              title={t('syncContacts.skipN', { count: chosen.length })}
              variant="secondary"
              disabled={!chosen.length || !!progress}
              onPress={() => {
                skip(chosen.map((c) => c.id));
                setUnticked(new Set());
              }}
            />
            <Button
              title={progress ? t('syncContacts.adding', { done: progress.done, total: progress.total }) : t('syncContacts.addN', { count: chosen.length })}
              loading={!!progress}
              disabled={!contacts || !chosen.length}
              onPress={add}
              style={{ flex: 1 }}
            />
          </Row>
        ) : undefined
      }
    >
      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        <View style={[styles.auto, { borderColor: colors.border }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{t('syncContacts.auto')}</Text>
            <Text variant="caption" tone="muted">
              {t('syncContacts.autoHint')}
            </Text>
          </View>
          <Switch
            value={auto}
            onChange={(v) => {
              setAuto(v);
              void setAutoAdd(v);
            }}
          />
        </View>
        <SearchField value={search} onChangeText={setSearch} placeholder={t('syncContacts.search')} />
      </View>
      <View style={{ marginTop: 10 }}>
        <UnderlineTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'toAdd', label: t('syncContacts.tab.toAdd'), count: groups.toAdd.length },
            { value: 'inCrm', label: t('syncContacts.tab.inCrm'), count: groups.inCrm.length },
            { value: 'skipped', label: t('syncContacts.tab.skipped'), count: groups.skipped.length },
          ]}
        />
      </View>
      {tab === 'toAdd' && groups.toAdd.length ? (
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 }}>
          <Text variant="caption" tone="muted">
            {t('syncContacts.selected', { count: chosen.length })}
          </Text>
          <Row gap={14}>
            <Text variant="caption" tone="primary" style={{ fontWeight: '600' }} onPress={() => setUnticked(new Set())}>
              {t('common.selectAll')}
            </Text>
            <Text variant="caption" tone="primary" style={{ fontWeight: '600' }} onPress={() => setUnticked(new Set(groups.toAdd.map((c) => c.id)))}>
              {t('common.clearAll')}
            </Text>
          </Row>
        </Row>
      ) : null}
      {!contacts ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(c) => c.id}
          initialNumToRender={30}
          renderItem={({ item }) =>
            tab === 'toAdd' ? (
              <SelectRow
                on={!unticked.has(item.id)}
                title={item.name}
                subtitle={formatPhone(item.phone)}
                onToggle={() => toggle(item.id)}
                right={<RowAction label={t('syncContacts.skip')} icon={<X size={13} color={colors.textMuted} />} onPress={() => skip([item.id])} />}
              />
            ) : tab === 'skipped' ? (
              <SelectRow
                noCheck
                on={false}
                title={item.name}
                subtitle={formatPhone(item.phone)}
                right={<RowAction label={t('syncContacts.restore')} icon={<RotateCcw size={13} color={colors.textMuted} />} onPress={() => restore([item.id])} />}
              />
            ) : (
              <SelectRow noCheck on title={item.name} subtitle={formatPhone(item.phone)} badge={t('syncContacts.inCrm')} />
            )
          }
          ListEmptyComponent={
            <Text tone="muted" center style={{ padding: 24 }}>
              {tab === 'skipped' ? t('syncContacts.noSkipped') : tab === 'inCrm' ? t('syncContacts.noneInCrm') : contacts?.length ? t('syncContacts.allDone') : t('syncContacts.empty')}
            </Text>
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  auto: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
});

/** One screen per account: switching accounts starts it fresh with that account's imported / skipped / auto-add state. */
export default function SyncContactsScreen() {
  const acct = useAccountsStore((s) => s.activeId);
  return <SyncContacts key={acct ?? 'none'} />;
}
