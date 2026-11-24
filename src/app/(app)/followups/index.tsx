/**
 * Auto Followup: the account's WhatsApp drip sequences. Each runs as a CPaaS
 * series per lead, started by hand from a lead or by an auto-start rule.
 */
import { router } from 'expo-router';
import { Plus, Repeat, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Row, Screen, StatusPill, Text } from '@/components/ui';
import { useSequences, useServices } from '@/hooks/queries';
import { describeCrmError } from '@/services/crm/client';
import { humanMinutes, triggerLabel } from '@/lib/followups';
import { cumulativeMinutes } from '@/services/crm/sequences';
import { P } from '@/lib/permissions';
import { useCan } from '@/stores/auth';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';

export default function Followups() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Anyone may see the series; creating and editing them is `P.app.series`.
  const canEdit = useCan(P.app.series);
  const config = useWhatsAppConfig();
  const api = config.mode === 'api';
  // With the WhatsApp app (no API) the same series run as "WhatsApp to send" tasks.
  const sequences = useSequences();
  const services = useServices();
  const serviceName = (id: string) => services.data?.find((x) => x.id === id)?.name;

  return (
    <Screen
      title={t('followup.title')}
      subtitle={api ? t('followup.sub') : t('waTasks.seriesSub')}
      back
      scroll
      onRefresh={() => sequences.refetch()}
      footer={canEdit ? <Button title={t('followup.new')} icon={<Plus size={18} color="#fff" />} onPress={() => router.push('/(app)/followups/edit')} /> : undefined}
    >
      <View style={{ gap: 12, marginTop: 8 }}>
        {sequences.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: 24 }} /> : null}
        {sequences.error ? <Text tone="danger">{describeCrmError(sequences.error)}</Text> : null}
        {sequences.data && !sequences.data.length ? (
          <EmptyState icon={<Repeat size={26} color="#fff" />} title={t('followup.empty')} body={t('followup.emptyBody')} />
        ) : null}
        {(sequences.data ?? []).map((s) => {
          const offsets = cumulativeMinutes(s.steps);
          return (
            <Pressable key={s.id} disabled={!canEdit} onPress={() => router.push({ pathname: '/(app)/followups/edit', params: { id: s.id } })}>
              <Card style={{ gap: 10, opacity: s.active ? 1 : 0.6 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="h3" numberOfLines={1} style={{ flex: 1 }}>
                    {s.name}
                  </Text>
                  <StatusPill label={s.active ? t('followup.active') : t('followup.paused')} color={s.active ? colors.success : colors.textMuted} />
                </Row>
                {s.description ? (
                  <Text variant="caption" tone="muted" numberOfLines={2}>
                    {s.description}
                  </Text>
                ) : null}
                <View style={styles.timeline}>
                  {s.steps.map((st, i) => (
                    <View key={st.id} style={[styles.dotWrap]}>
                      <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                      <Text variant="micro" tone="muted" numberOfLines={1}>
                        {humanMinutes(offsets[i], t)}
                      </Text>
                    </View>
                  ))}
                </View>
                <Row gap={6}>
                  <Zap size={14} color={s.trigger.kind === 'manual' ? colors.textFaint : colors.warning} />
                  <Text variant="caption" tone="muted">
                    {triggerLabel(s, t, serviceName)} · {t('followup.stepCount', { count: s.steps.length })}
                  </Text>
                </Row>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  timeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dotWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
