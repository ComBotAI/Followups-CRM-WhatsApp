/** Pick a follow-up sequence and start it on one lead. */
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Play, Plus, Repeat } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Sheet, Text } from '@/components/ui';
import { useSequences, waKeys } from '@/hooks/queries';
import { showAlert } from '@/lib/dialog';
import { humanMinutes } from '@/lib/followups';
import { describeCrmError } from '@/services/crm/client';
import type { Lead } from '@/services/crm/leads';
import { isRunningManually, startManualSequence } from '@/services/crm/waTasks';
import { P } from '@/lib/permissions';
import { useCan } from '@/stores/auth';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import { cumulativeMinutes, isRunningFor, senderContext, startSequence, type Sequence } from '@/services/crm/sequences';
import { useTheme } from '@/theme/ThemeProvider';

export function StartFollowupSheet({ open, lead, onClose }: { open: boolean; lead: Lead; onClose: () => void }) {
  const { t } = useTranslation();
  const canCreate = useCan(P.app.series);
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const sequences = useSequences(open);
  const manual = useWhatsAppConfig().mode !== 'api';
  const [busy, setBusy] = useState<string | null>(null);

  const start = async (s: Sequence) => {
    setBusy(s.id);
    try {
      if (manual) {
        // WhatsApp app: the steps become "WhatsApp to send" tasks.
        if (await isRunningManually(s.id, lead.id)) {
          showAlert(t('followup.alreadyRunning'), t('followup.alreadyRunningBody', { name: s.name }));
          return;
        }
        const count = await startManualSequence(s, lead, senderContext());
        void qc.invalidateQueries({ queryKey: ['waTasks'] });
        showAlert(t('followup.started'), t('waTasks.startedBody', { name: s.name, count }));
        onClose();
        return;
      }
      if (await isRunningFor(s.id, lead.id)) {
        showAlert(t('followup.alreadyRunning'), t('followup.alreadyRunningBody', { name: s.name }));
        return;
      }
      const series = await startSequence(s, lead, senderContext());
      await qc.invalidateQueries({ queryKey: waKeys.schedules(lead.id) });
      showAlert(t('followup.started'), t('followup.startedBody', { name: s.name, count: series?.occurrences.length ?? 0 }));
      onClose();
    } catch (err) {
      showAlert(t('followup.startFailed'), describeCrmError(err));
    } finally {
      setBusy(null);
    }
  };

  const list = (sequences.data ?? []).filter((s) => s.active && s.steps.length);

  return (
    <Sheet open={open} onClose={onClose} title={t('followup.start')} subtitle={t('followup.startFor', { name: lead.name })}>
      <View style={{ gap: 8 }}>
        {sequences.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {!sequences.isLoading && !list.length ? (
          <View style={{ gap: 10 }}>
            <Text tone="muted">{t('followup.empty')}</Text>
            {canCreate ? (
              <Button
                title={t('followup.new')}
                variant="secondary"
                icon={<Plus size={16} color={colors.primary} />}
                onPress={() => {
                  onClose();
                  router.push('/(app)/followups/edit');
                }}
              />
            ) : null}
          </View>
        ) : null}
        {list.map((s) => {
          const offsets = cumulativeMinutes(s.steps);
          return (
            <Pressable
              key={s.id}
              disabled={!!busy}
              onPress={() => void start(s)}
              style={({ pressed }) => [
                styles.row,
                { borderRadius: radius.md, borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
                <Repeat size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{s.name}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {t('followup.stepCount', { count: s.steps.length })} · {t('followup.lastAt', { when: humanMinutes(offsets[offsets.length - 1] ?? 0, t) })}
                </Text>
              </View>
              {busy === s.id ? <ActivityIndicator color={colors.primary} /> : <Play size={18} color={colors.primary} />}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
