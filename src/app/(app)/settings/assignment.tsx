/** Auto lead assignment: how new leads (imports, new contacts) get distributed. */
import { Check, Shuffle, Users } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, Row, Screen, Text } from '@/components/ui';
import { useTeam } from '@/hooks/queries';
import { readAssignmentRule, writeAssignmentRule, type AssignmentRule } from '@/services/crm/assignment';
import { useTheme } from '@/theme/ThemeProvider';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';

function Option({ active, title, body, onPress }: { active: boolean; title: string; body: string; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.option,
        {
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? colors.primarySoft : colors.surface,
          borderRadius: radius.md,
        },
      ]}
    >
      <View style={[styles.radio, { borderColor: active ? colors.primary : colors.borderStrong }]}>
        {active ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="muted">
          {body}
        </Text>
      </View>
    </Pressable>
  );
}

function AssignmentScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const team = useTeam();
  const [rule, setRule] = useState<AssignmentRule>(readAssignmentRule);
  const [saved, setSaved] = useState(false);

  const save = () => {
    writeAssignmentRule(rule);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  // "One person" keeps a single pick, so the screen shows who actually gets the leads.
  const pick = (mode: AssignmentRule['mode']) => setRule((r) => ({ ...r, mode, memberIds: mode === 'single' ? r.memberIds.slice(0, 1) : r.memberIds }));
  const showPicker = rule.mode === 'round_robin_selected' || rule.mode === 'single';

  return (
    <Screen
      title={t('settings.assignment')}
      subtitle={t('settings.assignmentSub')}
      back
      scroll
      footer={
        <Button
          title={saved ? t('common.done') : t('common.save')}
          full
          size="lg"
          onPress={save}
          icon={saved ? <Check size={18} color={colors.onPrimary} /> : undefined}
        />
      }
    >
      <View style={{ gap: 10, marginTop: 8 }}>
        <Row gap={8}>
          <Shuffle size={16} color={colors.textMuted} />
          <Text variant="caption" tone="muted">
            Distribution
          </Text>
        </Row>
        <Option
          active={rule.mode === 'round_robin_all'}
          title="Round robin — all employees"
          body="Auto-distribute evenly across every active member of the workspace."
          onPress={() => pick('round_robin_all')}
        />
        <Option
          active={rule.mode === 'round_robin_selected'}
          title="Selected employees only"
          body="Distribute only among the people you tick below."
          onPress={() => pick('round_robin_selected')}
        />
        <Option active={rule.mode === 'single'} title="One person" body="Every new lead goes to the same member." onPress={() => pick('single')} />
        <Option
          active={rule.mode === 'none'}
          title="Don't auto-assign"
          body="New leads stay unassigned until someone picks them up."
          onPress={() => pick('none')}
        />

        <Row gap={8} style={{ marginTop: 10 }}>
          <Users size={16} color={colors.textMuted} />
          <Text variant="caption" tone="muted">
            Employees{rule.mode === 'round_robin_all' ? ' — all included' : ''}
          </Text>
        </Row>
        <Card padded={false} style={{ opacity: showPicker ? 1 : 0.55 }}>
          {(team.data ?? []).map((m) => {
            const on = rule.memberIds.includes(m.userId) || rule.mode === 'round_robin_all';
            return (
              <Pressable
                key={m.userId}
                disabled={!showPicker}
                onPress={() =>
                  setRule((r) => ({
                    ...r,
                    memberIds:
                      r.mode === 'single'
                        ? [m.userId]
                        : r.memberIds.includes(m.userId)
                          ? r.memberIds.filter((x) => x !== m.userId)
                          : [...r.memberIds, m.userId],
                  }))
                }
                style={styles.member}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: on ? colors.primary : colors.borderStrong,
                      backgroundColor: on ? colors.primary : 'transparent',
                      borderRadius: radius.xs,
                    },
                  ]}
                >
                  {on ? <Check size={14} color={colors.onPrimary} /> : null}
                </View>
                <Avatar name={m.name} size={34} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{m.name}</Text>
                  <Text variant="micro" tone="muted">
                    {m.roleTitle || (m.isOwner ? t('common.owner') : t('common.member'))}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 14,
    borderWidth: 1.5,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Members whose role doesn't include it get a "not allowed" page (see `P.app`). */
export default function AssignmentScreenRoute() {
  return (
    <RequireCan all={[P.app.routing]}>
      <AssignmentScreen />
    </RequireCan>
  );
}
