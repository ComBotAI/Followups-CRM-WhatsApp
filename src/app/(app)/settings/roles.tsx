/** Owner only: the workspace's roles, each a set of permissions plus a record-access scope. */
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { ChevronRight, Lock, Plus, ShieldCheck, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Divider, EmptyState, Loading, Row, Screen, Text } from '@/components/ui';
import { StatusPill } from '@/components/ui/kit';
import { showAlert } from '@/lib/dialog';
import { saveRoleAppPermissions } from '@/services/crm/rolePermissions';
import { createRole, getPermissions, listRoles } from '@/services/sso/client';
import { presetExists, presetPayload, ROLE_PRESETS, type RolePreset } from '@/services/sso/rolePresets';
import { useAuthStore, useIsOwner } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { rtlFlip } from '@/lib/rtl';

export default function RolesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isOwner = useIsOwner();
  const token = useAuthStore((s) => s.token)!;
  const qc = useQueryClient();
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => listRoles(token),
    enabled: isOwner,
  });
  const [adding, setAdding] = useState<string | null>(null);

  if (!isOwner) return <Redirect href="/(app)/(tabs)/more" />;

  const open = (id?: string) => router.push(id ? { pathname: '/(app)/settings/role', params: { id } } : '/(app)/settings/role');
  const customise = (preset: RolePreset) => router.push({ pathname: '/(app)/settings/role', params: { preset: preset.id } });
  const suggestions = ROLE_PRESETS.filter((p) => !presetExists(roles.data ?? [], p));

  // `adding` is the preset's id, or 'all' while every suggestion is being added.
  const addPresets = async (presets: RolePreset[], busyKey: string) => {
    setAdding(busyKey);
    try {
      const catalogue = await qc.fetchQuery({ queryKey: ['permissions'], queryFn: () => getPermissions(token), staleTime: 60 * 60 * 1000 });
      for (const preset of presets) {
        const created = await createRole(token, presetPayload(catalogue, preset));
        // The app's own permissions ride along; without a data store the role simply gets the defaults.
        if (created?.id) await saveRoleAppPermissions(created.id, preset.title, preset.app).catch(() => undefined);
      }
    } catch (err) {
      showAlert(t('common.couldNotSave'), err instanceof Error ? err.message : '');
    } finally {
      // Refresh even after a failure: the ones before it were created.
      await qc.invalidateQueries({ queryKey: ['roles'] });
      setAdding(null);
    }
  };
  const addPreset = (preset: RolePreset) => addPresets([preset], preset.id);

  const suggested = suggestions.length ? (
    <>
      <Row gap={6} style={styles.heading}>
        <Sparkles size={14} color={colors.accent} />
        <Text variant="micro" tone="faint" style={{ flex: 1 }}>
          {t('roles.suggested').toUpperCase()}
        </Text>
        {suggestions.length > 1 ? (
          <Button
            title={t('roles.addAll')}
            size="sm"
            variant="ghost"
            loading={adding === 'all'}
            disabled={!!adding}
            onPress={() => void addPresets(suggestions, 'all')}
          />
        ) : null}
      </Row>
      <Card padded={false}>
        {suggestions.map((p, i) => (
          <View key={p.id}>
            <Pressable onPress={() => customise(p)} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
              <Row gap={12}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="bodyStrong">{p.title}</Text>
                  <Text variant="caption" tone="muted">
                    {t(`roles.preset.${p.id}.body`)}
                  </Text>
                  <StatusPill label={p.dataScope === 'all' ? t('roles.scopeAll') : t('roles.scopeOwn')} color={colors.accent} />
                </View>
                <Button
                  title={t('common.add')}
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={14} color={colors.primary} />}
                  loading={adding === p.id}
                  disabled={!!adding}
                  onPress={() => void addPreset(p)}
                />
              </Row>
            </Pressable>
            {i < suggestions.length - 1 ? <Divider inset={12} /> : null}
          </View>
        ))}
      </Card>
      <Text variant="micro" tone="faint" style={{ marginTop: 6, marginStart: 4 }}>
        {t('roles.suggestedHint')}
      </Text>
    </>
  ) : null;

  return (
    <Screen title={t('roles.title')} subtitle={t('roles.subtitle')} back scroll right={<Button title={t('roles.new')} size="sm" onPress={() => open()} />}>
      {roles.isLoading ? (
        <Loading />
      ) : roles.isError ? (
        <EmptyState
          title={t('common.errorTitle')}
          body={roles.error instanceof Error ? roles.error.message : ''}
          action={t('common.retry')}
          onAction={() => void roles.refetch()}
        />
      ) : !roles.data?.length ? (
        <>
          <EmptyState
            icon={<ShieldCheck size={28} color={colors.primary} />}
            title={t('roles.emptyTitle')}
            body={t('roles.emptyBody')}
            action={t('roles.new')}
            onAction={() => open()}
          />
          {suggested}
        </>
      ) : (
        <>
          <Card padded={false} style={{ marginTop: 8 }}>
            {roles.data.map((r, i) => (
              <View key={r.id}>
                <Pressable onPress={() => open(r.id)} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
                  <Row gap={12}>
                    {r.is_system ? <Lock size={18} color={colors.textMuted} /> : <ShieldCheck size={18} color={colors.primary} />}
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {r.title}
                      </Text>
                      {r.description ? (
                        <Text variant="caption" tone="muted" numberOfLines={2}>
                          {r.description}
                        </Text>
                      ) : null}
                      <Row gap={6} style={{ flexWrap: 'wrap' }}>
                        <StatusPill label={t('roles.permissionCount', { count: r.permission?.length ?? 0 })} color={colors.primary} />
                        <StatusPill label={r.data_scope === 'all' ? t('roles.scopeAll') : t('roles.scopeOwn')} color={colors.accent} />
                        <StatusPill label={t('roles.memberCount', { count: r.members ?? 0 })} color={colors.textMuted} />
                        {r.is_system ? <StatusPill label={t('roles.system')} color={colors.warning} /> : null}
                      </Row>
                    </View>
                    <ChevronRight size={18} color={colors.textFaint} style={rtlFlip()} />
                  </Row>
                </Pressable>
                {i < roles.data.length - 1 ? <Divider inset={42} /> : null}
              </View>
            ))}
          </Card>
          {suggested}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { padding: 12 }, heading: { marginTop: 18, marginBottom: 6, marginStart: 4 } });
