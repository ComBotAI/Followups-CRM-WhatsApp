/**
 * A contact's services: what they have taken, their reminders still to come
 * (stoppable). Past visits have their own tab (ContactVisits). "Record
 * visit" restarts the reminders.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, BellRing, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { RecordVisitSheet } from '@/components/services/RecordVisitSheet';
import { Button, Card, Row, Text } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/dialog';
import { formatWhen } from '@/lib/time';
import { describeCrmError } from '@/services/crm/client';
import type { Lead } from '@/services/crm/leads';
import { listRuns, nextDue, stopRun, type ServiceRun } from '@/services/crm/services';
import { P } from '@/lib/permissions';
import { useCan } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

export function ContactServices({ lead }: { lead: Lead }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const [recording, setRecording] = useState(false);
  const canVisit = useCan(P.app.visits);
  const runs = useQuery({ queryKey: ['services', 'contact', lead.id, 'runs'], queryFn: () => listRuns(lead.id) });
  const now = runs.dataUpdatedAt || 0;
  const upcoming = (runs.data ?? []).filter((r) => r.status === 'active' && nextDue(r, now));

  const stop = async (run: ServiceRun) => {
    const ok = await confirmAction({
      title: t('services.stopQ', { name: run.serviceName }),
      message: t('services.stopBody'),
      confirmText: t('services.stop'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await stopRun(run, 'stopped by hand');
      void qc.invalidateQueries({ queryKey: ['services', 'contact', lead.id] });
      void qc.invalidateQueries({ queryKey: ['waTasks'] });
    } catch (e) {
      showAlert(t('services.stopFailed'), describeCrmError(e));
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {canVisit ? <Button title={t('services.recordVisit')} icon={<Plus size={16} color="#fff" />} onPress={() => setRecording(true)} /> : null}

      {lead.services.length || lead.lastVisit ? (
        <Card style={{ gap: 8 }}>
          {lead.lastVisit ? (
            <Text variant="caption" tone="muted">
              {t('services.lastVisit', { when: formatWhen(lead.lastVisit) })}
            </Text>
          ) : null}
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {lead.services.map((s) => (
              <View key={s} style={[styles.pill, { backgroundColor: colors.primarySoft, borderRadius: radius.pill }]}>
                <Text variant="caption" tone="primary" style={{ fontWeight: '600' }}>
                  {s}
                </Text>
              </View>
            ))}
          </Row>
        </Card>
      ) : null}

      <Text variant="micro" tone="faint">
        {t('services.upcoming').toUpperCase()}
      </Text>
      {runs.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {!runs.isLoading && !upcoming.length ? (
        <Text variant="caption" tone="muted">
          {t('services.noUpcoming')}
        </Text>
      ) : null}
      {upcoming.map((r) => (
        <Card key={r.id} style={styles.row}>
          <BellRing size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {r.serviceName}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {t('services.nextOn', { when: formatWhen(nextDue(r, now)!) })} · {r.sequenceName}
            </Text>
          </View>
          <Pressable onPress={() => void stop(r)} hitSlop={8} style={{ padding: 4 }} accessibilityLabel={t('services.stop')}>
            <BellOff size={18} color={colors.danger} />
          </Pressable>
        </Card>
      ))}

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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pill: { paddingHorizontal: 10, paddingVertical: 4 },
});
