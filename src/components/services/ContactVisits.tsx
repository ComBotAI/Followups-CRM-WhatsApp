/**
 * A contact's visit history, newest first: when, what they had, who served
 * them, what they paid. "Record visit" adds one; the bin deletes one (their
 * visit count, spend and tier are recalculated).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { RecordVisitSheet } from '@/components/services/RecordVisitSheet';
import { Button, Card, EmptyState, Text } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/dialog';
import { P } from '@/lib/permissions';
import { formatWhen } from '@/lib/time';
import { describeCrmError } from '@/services/crm/client';
import type { Lead } from '@/services/crm/leads';
import { deleteVisit, listVisits, type ServiceVisit } from '@/services/crm/services';
import { useCan } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

/** Under the contact's services key, so recording or deleting a visit refreshes it. */
const contactVisitsKey = (contactId: string) => ['services', 'contact', contactId, 'visits'] as const;

const useContactVisits = (contactId: string) => useQuery({ queryKey: contactVisitsKey(contactId), queryFn: () => listVisits(contactId), enabled: !!contactId });

/** Rows shown at first, and added per "Show more": a long-time regular can have hundreds. */
const PAGE = 30;

export function ContactVisits({ lead }: { lead: Lead }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const canVisit = useCan(P.app.visits);
  const visits = useContactVisits(lead.id);

  const removeVisit = async (v: ServiceVisit) => {
    const ok = await confirmAction({
      title: t('services.deleteVisitQ', { defaultValue: 'Delete this visit?' }),
      message: t('services.deleteVisitBody', {
        defaultValue: 'Their visit count, spend and tier are recalculated. Reminders it started keep going; stop them in Services if needed.',
      }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await deleteVisit(v);
      void qc.invalidateQueries({ queryKey: ['services', 'contact', lead.id] });
      void qc.invalidateQueries({ queryKey: ['lead', lead.id] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['visits'] });
      if (res.profileFailed)
        showAlert(
          t('visits.profileFailedTitle', { defaultValue: 'Profile not updated' }),
          t('visits.deleteProfileFailed', {
            defaultValue: "The visit is deleted, but the guest's visit count and spend could not be updated (check that your role can edit contacts).",
          }),
        );
    } catch (e) {
      showAlert(t('common.couldNotSave'), describeCrmError(e));
    }
  };

  const list = visits.data ?? [];

  return (
    <View style={{ gap: 12 }}>
      {canVisit ? <Button title={t('services.recordVisit')} icon={<Plus size={16} color="#fff" />} onPress={() => setRecording(true)} /> : null}

      {visits.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {visits.isError ? (
        <EmptyState title={t('visits.loadFailed')} action={t('common.retry')} onAction={() => void visits.refetch()} />
      ) : null}
      {!visits.isLoading && !visits.isError && !list.length ? (
        <Text variant="caption" tone="muted">
          {t('services.noVisits')}
        </Text>
      ) : null}

      {list.length ? (
        <Card padded={false}>
          {list.slice(0, shown).map((v, i) => (
            <View key={v.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={[styles.icon, { backgroundColor: colors.successSoft }]}>
                <CalendarCheck size={16} color={colors.success} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {formatWhen(v.visitedAt)}
                </Text>
                {v.serviceNames.length ? (
                  <Text variant="body" numberOfLines={2}>
                    {v.serviceNames.join(', ')}
                  </Text>
                ) : null}
                {v.partySize || v.memberName || v.note ? (
                  <Text variant="caption" tone="muted" numberOfLines={3}>
                    {[v.partySize ? t('visits.partyN', { count: v.partySize }) : '', v.memberName ? t('visits.servedByName', { name: v.memberName }) : '', v.note].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
              {v.price != null ? (
                <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
                  {v.price.toLocaleString()}
                </Text>
              ) : null}
              {canVisit ? (
                <Pressable
                  onPress={() => void removeVisit(v)}
                  hitSlop={8}
                  style={{ padding: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('services.deleteVisit', { defaultValue: 'Delete visit' })}
                >
                  <Trash2 size={16} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}
      {/* Visits counted on the contact from before visits were recorded (an import): in the tab count, not in this list. */}
      {visits.data && !visits.isError && (lead.visitCount || 0) > list.length ? (
        <Text variant="caption" tone="faint">
          {t('visits.earlierVisits', { count: (lead.visitCount || 0) - list.length })}
        </Text>
      ) : null}
      {list.length > shown ? (
        <Button
          title={t('reports.showMore', { count: Math.min(PAGE, list.length - shown) })}
          variant="secondary"
          onPress={() => setShown((n) => n + PAGE)}
        />
      ) : null}

      {recording ? (
        <RecordVisitSheet
          contactId={lead.id}
          lead={lead}
          onClose={(changed) => {
            setRecording(false);
            if (changed) void qc.invalidateQueries({ queryKey: ['services', 'contact', lead.id] });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
