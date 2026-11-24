import { useQueryClient } from '@tanstack/react-query';
import { Check, Shuffle, UserX } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { showAlert } from '@/lib/dialog';
import { eachLimited } from '@/lib/pool';
import { Avatar, Button, Row, Sheet, Text } from '@/components/ui';
import { useTeam } from '@/hooks/queries';
import { assignLead, assignLeadsRoundRobin } from '@/services/crm/assignment';
import { describeCrmError } from '@/services/crm/client';
import type { Lead } from '@/services/crm/leads';
import type { Teammate } from '@/services/sso/client';
import { useTheme } from '@/theme/ThemeProvider';

export function AssignSheet({ leads, open, onClose }: { leads: Lead[]; open: boolean; onClose: (changed: boolean) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const team = useTeam();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'single' | 'round_robin'>('single');
  const [busy, setBusy] = useState(false);
  const many = leads.length > 1;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onClose(true);
    } catch (err) {
      showAlert(t('assignSheet.failed'), describeCrmError(err));
    } finally {
      // Also after a failure part-way: the contacts already done must show their new owner.
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['board'] });
      leads.forEach((l) => void qc.invalidateQueries({ queryKey: ['lead', l.id] }));
      setBusy(false);
    }
  };

  const assignTo = (member: Teammate | null) =>
    run(async () => {
      // A few at a time; every contact is tried, and the first error is reported after.
      let first: unknown = null;
      await eachLimited(leads, (lead) =>
        assignLead(lead, member).catch((err: unknown) => {
          first ??= err;
          throw err;
        }),
      );
      if (first) throw first;
    });

  const roundRobin = () => {
    const pool = (team.data ?? []).filter((m) => (picked.size ? picked.has(m.userId) : true));
    if (!pool.length) return showAlert(t('assignSheet.pickOne'));
    return run(async () => {
      await assignLeadsRoundRobin(leads, pool);
    });
  };

  return (
    <Sheet
      open={open}
      onClose={() => onClose(false)}
      title={many ? t('assignSheet.titleMany', { count: leads.length }) : t('assignSheet.titleOne', { name: leads[0]?.name ?? '' })}
      subtitle={many ? t('assignSheet.subtitleMany') : undefined}
      locked={busy}
      footer={
        many && mode === 'round_robin' ? (
          <Button
            title={picked.size ? t('assignSheet.distributeAmong', { count: picked.size }) : t('assignSheet.distributeAll')}
            icon={<Shuffle size={16} color={colors.onPrimary} />}
            full
            onPress={() => void roundRobin()}
            loading={busy}
          />
        ) : undefined
      }
    >
      {many ? (
        <Row gap={8}>
          <Button title={t('assignSheet.onePerson')} size="sm" variant={mode === 'single' ? 'primary' : 'outline'} onPress={() => setMode('single')} />
          <Button
            title={t('assignSheet.roundRobin')}
            size="sm"
            variant={mode === 'round_robin' ? 'primary' : 'outline'}
            onPress={() => setMode('round_robin')}
            icon={<Shuffle size={14} color={mode === 'round_robin' ? colors.onPrimary : colors.text} />}
          />
        </Row>
      ) : null}
      {team.isLoading ? (
        <Text tone="muted">{t('assignSheet.loadingTeam')}</Text>
      ) : !team.data?.length ? (
        <Text tone="muted">{t('assignSheet.noTeam')}</Text>
      ) : (
        <View style={{ gap: 4 }}>
          {team.data.map((m) => {
            const current = !many && leads[0]?.agentId === m.userId;
            const selected = picked.has(m.userId);
            return (
              <Pressable
                key={m.userId}
                disabled={busy}
                onPress={() => {
                  if (mode === 'round_robin') {
                    const next = new Set(picked);
                    if (next.has(m.userId)) next.delete(m.userId);
                    else next.add(m.userId);
                    setPicked(next);
                  } else void assignTo(m);
                }}
                style={({ pressed }) => [
                  styles.member,
                  {
                    backgroundColor: pressed || selected ? colors.surfaceAlt : 'transparent',
                  },
                ]}
              >
                <Avatar name={m.name} size={38} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{m.name}</Text>
                  <Text variant="caption" tone="muted">
                    {m.roleTitle || (m.isOwner ? t('common.owner') : t('common.member'))}
                    {m.email ? ` · ${m.email}` : ''}
                  </Text>
                </View>
                {current || selected ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
          <Pressable
            disabled={busy}
            onPress={() => void assignTo(null)}
            style={({ pressed }) => [styles.member, pressed && { backgroundColor: colors.surfaceAlt }]}
          >
            <View style={[styles.unassign, { backgroundColor: colors.dangerSoft }]}>
              <UserX size={18} color={colors.danger} />
            </View>
            <Text variant="bodyStrong" tone="danger">
              {t('assignSheet.unassign')}
            </Text>
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
  },
  unassign: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
