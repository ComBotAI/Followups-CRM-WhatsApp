/**
 * Owner view of the team: every member with their role, a way to change a
 * member's role (what they may see and do) and to remove them from the
 * workspace. Members are added in the SSO panel, then sign in here with their
 * own login; the app has no invites.
 */
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Info, UserX } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { confirmAction, showAlert } from '@/lib/dialog';
import { Avatar, Button, Card, Chip, Divider, Row, Screen, Sheet, Text } from '@/components/ui';
import { keys, useTeam } from '@/hooks/queries';
import { listRoles, revokeMember, updateMember, type Teammate } from '@/services/sso/client';
import { Redirect } from 'expo-router';
import { useAuthStore, useIsOwner } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

function MembersScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token)!;
  const team = useTeam();
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => listRoles(token),
  });
  const [editing, setEditing] = useState<Teammate | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openRole = (m: Teammate) => {
    setEditing(m);
    setRoleId(m.roleId || null);
  };

  const saveRole = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await updateMember(token, editing.id, { role: roleId });
      await qc.invalidateQueries({ queryKey: keys.team });
      setEditing(null);
    } catch (err) {
      showAlert(t('members.roleFailed', { defaultValue: 'Could not change the role' }), err instanceof Error ? err.message : '');
    } finally {
      setBusy(false);
    }
  };

  const confirmRevoke = async (id: string, name: string) => {
    const ok = await confirmAction({
      title: t('members.removeQ', { defaultValue: 'Remove {{name}}?', name }),
      message: t('members.removeBody', { defaultValue: 'They keep their login but lose access to this workspace. Leads assigned to them stay assigned.' }),
      confirmText: t('common.remove'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    await revokeMember(token, id).catch((e: Error) => showAlert(t('members.removeFailed', { defaultValue: 'Could not remove' }), e.message));
    void qc.invalidateQueries({ queryKey: keys.team });
  };

  return (
    <Screen title={t('settings.members')} subtitle={t('settings.membersSub')} back scroll onRefresh={() => team.refetch()}>
      <Card padded={false} style={{ marginTop: 8 }}>
        {(team.data ?? []).map((m, i) => (
          <View key={m.id}>
            <Row gap={12} style={styles.row}>
              <Avatar name={m.name} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{m.name}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {m.email}
                </Text>
                {m.isOwner ? (
                  <Text variant="caption" tone="primary">
                    {t('common.owner')}
                  </Text>
                ) : (
                  <Pressable
                    onPress={() => openRole(m)}
                    accessibilityRole="button"
                    accessibilityLabel={t('members.changeRole', { defaultValue: 'Change role' })}
                    hitSlop={6}
                    style={styles.rolePick}
                  >
                    <Text variant="caption" tone="primary" style={{ fontWeight: '600' }}>
                      {m.roleTitle || t('members.noRole', { defaultValue: 'No role' })}
                    </Text>
                    <ChevronDown size={14} color={colors.primary} />
                  </Pressable>
                )}
              </View>
              {!m.isOwner ? (
                <Button
                  variant="danger"
                  size="sm"
                  icon={<UserX size={14} color={colors.danger} />}
                  accessibilityLabel={t('members.removeLabel', { defaultValue: 'Remove {{name}}', name: m.name })}
                  onPress={() => void confirmRevoke(m.id, m.name)}
                />
              ) : null}
            </Row>
            {i < (team.data?.length ?? 0) - 1 ? <Divider inset={64} /> : null}
          </View>
        ))}
      </Card>

      <Card style={{ marginTop: 14, flexDirection: 'row', gap: 10 }}>
        <Info size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>
          {t('members.addHint', {
            defaultValue: 'New team members are added from your account panel. They then sign in to the app with their own email and password, and you choose their role here.',
          })}
        </Text>
      </Card>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t('members.changeRole', { defaultValue: 'Change role' })}
        subtitle={editing?.name}
        locked={busy}
      >
        <View style={{ gap: 10 }}>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Chip label={t('members.noRole', { defaultValue: 'No role' })} selected={roleId == null} onPress={() => setRoleId(null)} />
            {(roles.data ?? []).map((r) => (
              <Chip key={r.id} label={r.title} selected={roleId === r.id} onPress={() => setRoleId(r.id)} />
            ))}
          </Row>
          <Text variant="micro" tone="faint">
            {t('members.roleHint', { defaultValue: 'A role with record access “own” only shows members the leads assigned to them.' })}
          </Text>
          <Button title={t('common.save')} full loading={busy} onPress={() => void saveRole()} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { padding: 12 },
  rolePick: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
});

/** Owner only, like Roles: hidden from members in More, and blocked when opened by link. */
export default function MembersScreenGate() {
  const isOwner = useIsOwner();
  if (!isOwner) return <Redirect href="/(app)/(tabs)/more" />;
  return <MembersScreen />;
}
