/**
 * A lead's scheduled WhatsApp messages from CPaaS: one-off schedules and
 * follow-up sequence steps, with send-now and cancel (single or whole
 * sequence). Status and the reason a step stood down come from the server.
 */
import type { ScheduledMessage } from '@ab-ecosystem/cpaas';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Repeat, Send, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Row, StatusPill, Text } from '@/components/ui';
import { useContactSchedules, waKeys } from '@/hooks/queries';
import { confirmAction, showAlert } from '@/lib/dialog';
import { describeCrmError } from '@/services/crm/client';
import { cancelScheduled, cancelSeries, sendScheduledNow, sequenceNameOf } from '@/services/crm/sequences';
import { useTheme } from '@/theme/ThemeProvider';

const templateName = (m: ScheduledMessage) => {
  const c = m.content as { type?: string; template?: { name?: string }; text?: { body?: string } };
  return c.type === 'template' ? (c.template?.name ?? '') : (c.text?.body ?? c.type ?? '');
};

export function ScheduledMessages({ contactId, onNew, onFollowup }: { contactId: string; onNew: () => void; onFollowup: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const q = useContactSchedules(contactId);
  const [busy, setBusy] = useState<string | null>(null);

  const color = (s: ScheduledMessage['status']) =>
    s === 'sent' ? colors.success : s === 'pending' || s === 'processing' ? colors.primary : s === 'failed' ? colors.danger : colors.textMuted;

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: waKeys.schedules(contactId) });
    } catch (err) {
      showAlert(t('common.errorTitle'), describeCrmError(err));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (m: ScheduledMessage) => {
    if (m.series) {
      const all = await confirmAction({
        title: t('sched.cancelTitle'),
        message: t('sched.cancelSeriesQ'),
        confirmText: t('sched.cancelWhole'),
        cancelText: t('sched.cancelOne'),
        destructive: true,
      });
      return act(m.id, () => (all ? cancelSeries(m.series!) : cancelScheduled(m.id)));
    }
    const ok = await confirmAction({ title: t('sched.cancelTitle'), confirmText: t('sched.cancel'), cancelText: t('common.cancel'), destructive: true });
    if (ok) await act(m.id, () => cancelScheduled(m.id));
  };

  const rows = q.data ?? [];

  return (
    <View style={{ gap: 10 }}>
      <Row gap={10}>
        <Button
          title={t('sched.new')}
          size="sm"
          variant="secondary"
          icon={<CalendarClock size={16} color={colors.primary} />}
          onPress={onNew}
          style={{ flex: 1 }}
        />
        <Button
          title={t('followup.start')}
          size="sm"
          variant="secondary"
          icon={<Repeat size={16} color={colors.primary} />}
          onPress={onFollowup}
          style={{ flex: 1 }}
        />
      </Row>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: 20 }} /> : null}
      {q.error ? <Text tone="danger">{describeCrmError(q.error)}</Text> : null}
      {!q.isLoading && !rows.length ? (
        <EmptyState icon={<CalendarClock size={26} color="#fff" />} title={t('sched.empty')} body={t('sched.emptyBody')} />
      ) : null}
      {rows.length ? (
        <Card padded={false}>
          {rows.map((m, i) => (
            <View key={m.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={{ flex: 1, gap: 3 }}>
                <Row gap={6}>
                  {m.series ? <Repeat size={13} color={colors.accent} /> : null}
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                    {m.series ? `${sequenceNameOf(m.title)} · ${t('sched.step', { n: m.occurrence })}` : m.title || templateName(m)}
                  </Text>
                </Row>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {templateName(m)} · {new Date(m.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </Text>
                {m.result?.reason && m.status !== 'pending' && m.status !== 'sent' ? (
                  <Text variant="micro" tone="faint">
                    {t(`sched.reason.${m.result.reason}`, { defaultValue: m.result.reason })}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <StatusPill label={t(`sched.status.${m.status}`)} color={color(m.status)} />
                {m.status === 'pending' ? (
                  busy === m.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Row gap={14}>
                      <Pressable onPress={() => void act(m.id, () => sendScheduledNow(m.id))} hitSlop={8} accessibilityLabel={t('sched.sendNow')}>
                        <Send size={16} color={colors.primary} />
                      </Pressable>
                      <Pressable onPress={() => void cancel(m)} hitSlop={8} accessibilityLabel={t('sched.cancel')}>
                        <X size={16} color={colors.danger} />
                      </Pressable>
                    </Row>
                  )
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
});
