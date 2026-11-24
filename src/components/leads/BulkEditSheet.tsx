/**
 * Bulk edit for selected contacts (Contacts page): pick what to
 * change (contact type, status, any dropdown field
 * the user added, add / remove tags, assign), pick the value, apply to all.
 * Inbox chats are the same contacts, so callers pass ids and the sheet loads
 * each contact before writing.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Users } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AssignSheet } from '@/components/leads/AssignSheet';
import { Button, Chip, Row, Sheet, Text } from '@/components/ui';
import { useLeadOptions, useTags } from '@/hooks/queries';
import { showAlert } from '@/lib/dialog';
import { eachLimited } from '@/lib/pool';
import { rtlFlip } from '@/lib/rtl';
import { dropdownPatch, getLead, updateLead, type Lead, type LeadInput } from '@/services/crm/leads';
import { afterLeadChange } from '@/services/crm/sequences';
import { dropdownOptions, F, isAccountDropdown } from '@/services/crm/schema';
import { useIsOwner } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

type Target = { kind: 'dropdown'; slug: string; label: string; options: string[]; labelOf: (v: string) => string } | { kind: 'addTags' | 'removeTags' };

export function BulkEditSheet({ ids, leads: given, onClose }: { ids: string[]; leads?: Lead[]; onClose: (changed: boolean) => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const isOwner = useIsOwner();
  const options = useLeadOptions();
  const tags = useTags();
  const [target, setTarget] = useState<Target | null>(null);
  const [value, setValue] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [assign, setAssign] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  // The contacts to change (a few loaded at a time). Writes re-read each one's current values and
  // tags first, so a list's copy is enough when the caller has one.
  const loaded = useQuery({
    queryKey: ['bulkLeads', ids.join(',')],
    queryFn: async () => {
      const out: (Lead | undefined)[] = [];
      await eachLimited(ids, async (id, i) => {
        out[i] = await getLead(id);
      });
      return out.filter((l): l is Lead => !!l);
    },
    initialData: given && given.length === ids.length ? given : undefined,
    staleTime: 30_000,
  });
  const leads = loaded.data ?? [];

  const translated = (prefix: string) => (v: string) => t(`${prefix}.${v}`, { defaultValue: v });
  const userDropdowns = (options.fields.data ?? []).filter(isAccountDropdown);
  const targets: Target[] = [
    { kind: 'dropdown', slug: F.contactType, label: t('leads.contactType'), options: options.contactTypes, labelOf: translated('contactType') },
    { kind: 'dropdown', slug: F.status, label: t('leads.leadStatus'), options: options.statuses, labelOf: translated('status') },
    ...userDropdowns.map((f): Target => ({ kind: 'dropdown', slug: f.slug, label: f.name || f.slug, options: dropdownOptions(f), labelOf: (v) => v })),
    { kind: 'addTags' },
    { kind: 'removeTags' },
  ];
  const titleOf = (x: Target) => (x.kind === 'dropdown' ? x.label : t(`bulk.${x.kind}`));

  const inputFor = (): LeadInput | null => {
    if (!target) return null;
    if (target.kind === 'dropdown') return value === null ? null : dropdownPatch(target.slug, value);
    // Applied to each contact's tags as stored now (updateLead reads them), not this sheet's copy.
    return target.kind === 'addTags' ? { addTags: [...picked] } : { removeTags: [...picked] };
  };

  const apply = async () => {
    setProgress(0);
    const failed = await eachLimited(
      leads,
      async (lead) => {
        const input = inputFor();
        if (!input) return;
        const updated = await updateLead(lead, input);
        // As for a single contact: a status or tag change starts the follow-up series set to run on it.
        void afterLeadChange(lead, updated).catch(() => undefined);
      },
      setProgress,
    );
    setProgress(null);
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['board'] });
    // The next bulk edit must start from the contacts as they are now (tags especially).
    qc.removeQueries({ queryKey: ['bulkLeads'] });
    leads.forEach((l) => void qc.invalidateQueries({ queryKey: ['lead', l.id] }));
    if (failed) showAlert(t('bulk.someFailed', { count: failed }));
    onClose(true);
  };

  const busy = progress !== null;
  const ready = target && (target.kind === 'dropdown' ? value !== null : picked.size > 0);

  if (assign) return <AssignSheet leads={leads} open onClose={(changed) => (changed ? onClose(true) : setAssign(false))} />;

  return (
    <Sheet
      open
      onClose={() => (target && !busy ? setTarget(null) : onClose(false))}
      locked={busy}
      title={target ? titleOf(target) : t('bulk.title', { count: ids.length })}
      subtitle={target ? t('bulk.title', { count: ids.length }) : t('bulk.sub')}
      footer={
        target ? (
          <Button
            title={busy ? t('bulk.updating', { done: progress, count: leads.length }) : t('bulk.apply', { count: leads.length })}
            disabled={!ready || busy || !leads.length}
            loading={busy}
            onPress={() => void apply()}
          />
        ) : undefined
      }
    >
      {loaded.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ padding: 24 }} />
      ) : !target ? (
        <View style={{ gap: 2 }}>
          {isOwner ? (
            <Pressable onPress={() => setAssign(true)} style={[styles.row, { borderRadius: radius.md }]}>
              <Users size={18} color={colors.primary} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {t('common.assign')}
              </Text>
              <ChevronRight size={18} color={colors.textFaint} style={rtlFlip()} />
            </Pressable>
          ) : null}
          {targets.map((x) => (
            <Pressable
              key={x.kind === 'dropdown' ? x.slug : x.kind}
              onPress={() => {
                setTarget(x);
                setValue(null);
                setPicked(new Set());
              }}
              style={[styles.row, { borderRadius: radius.md }]}
            >
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {titleOf(x)}
              </Text>
              <ChevronRight size={18} color={colors.textFaint} style={rtlFlip()} />
            </Pressable>
          ))}
        </View>
      ) : target.kind === 'dropdown' ? (
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {target.options.map((o) => (
            <Chip key={o} label={target.labelOf(o)} selected={value === o} onPress={() => setValue(o)} />
          ))}
          {target.slug !== F.contactType && target.slug !== F.status ? <Chip label={t('bulk.clear')} selected={value === ''} onPress={() => setValue('')} /> : null}
        </Row>
      ) : (
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {(tags.data ?? []).map((tg) => (
            <Chip
              key={tg.id}
              label={tg.name}
              selected={picked.has(tg.id)}
              onPress={() => {
                const next = new Set(picked);
                if (next.has(tg.id)) next.delete(tg.id);
                else next.add(tg.id);
                setPicked(next);
              }}
            />
          ))}
          {!tags.isLoading && !tags.data?.length ? <Text tone="muted">{t('bulk.noTags')}</Text> : null}
        </Row>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 8 },
});
