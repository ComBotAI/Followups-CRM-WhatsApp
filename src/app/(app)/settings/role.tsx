/**
 * Owner only: create or edit one role. `?id=` edits; without it, a new role.
 *
 * The permission list comes from the server's catalogue, never a hardcoded
 * list. Ticking an action also brings in what it `implies`; those show as
 * included-automatically and are saved too, since the server stores exactly
 * the set it is sent.
 *
 * Below them, the app's own permissions (imports, lead routing, visits, workspace
 * settings…), saved to the data store; a system role can't be changed on the
 * server, but its app permissions can.
 */
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Lock, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { DataScope, PermissionFeature } from '@ab-ecosystem/sso';

import { confirmAction, showAlert } from '@/lib/dialog';
import { Button, Card, Chip, Divider, EmptyState, Input, Loading, Row, Screen, SegmentedControl, Text } from '@/components/ui';
import { StatusPill } from '@/components/ui/kit';
import { keys } from '@/hooks/queries';
import { APP_PERMISSIONS, appPermLabel, DEFAULT_APP_PERMISSIONS } from '@/lib/permissions';
import { deleteRoleAppPermissions, fetchRoleAppPermissions, saveRoleAppPermissions } from '@/services/crm/rolePermissions';
import { createRole, deleteRole, expandPermissions, getPermissions, listRoles, minimalPermissions, updateRole } from '@/services/sso/client';
import { ROLE_PRESETS, resolvePreset } from '@/services/sso/rolePresets';
import { appPermKeys, useAuthStore, useIsOwner } from '@/stores/auth';
import { useFeatures } from '@/stores/features';
import { useTheme } from '@/theme/ThemeProvider';

/** The server's cap, after dedupe. */
const MAX_PERMISSIONS = 1000;

const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set([...a, ...b]).size === a.length;

export default function RoleEditorScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const isOwner = useIsOwner();
  const token = useAuthStore((s) => s.token)!;
  const { id, preset: presetId } = useLocalSearchParams<{ id?: string; preset?: string }>();
  const preset = id ? undefined : ROLE_PRESETS.find((p) => p.id === presetId);
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => listRoles(token), enabled: isOwner && !!id });
  const catalogue = useQuery({ queryKey: ['permissions'], queryFn: () => getPermissions(token), enabled: isOwner, staleTime: 60 * 60 * 1000 });
  const savedApp = useQuery({ queryKey: appPermKeys.role(id ?? ''), queryFn: () => fetchRoleAppPermissions(id!), enabled: isOwner && !!id, retry: 1 });
  const features = useFeatures();
  const role = id ? roles.data?.find((r) => r.id === id) : undefined;
  const readOnly = !!role?.is_system;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<DataScope>('own');
  const [selected, setSelected] = useState<string[]>([]);
  const [appSelected, setAppSelected] = useState<string[]>(preset?.app ?? DEFAULT_APP_PERMISSIONS);
  const [appFilled, setAppFilled] = useState(!id);
  // A failed read must not look like "never set": the form would show the defaults and a save would overwrite the real set.
  if (!appFilled && !savedApp.isLoading && !savedApp.isError) {
    setAppFilled(true);
    setAppSelected(savedApp.data ?? DEFAULT_APP_PERMISSIONS);
  }
  const [busy, setBusy] = useState(false);

  // Fill the form once, when the role or suggested role (and, if it loads, the catalogue) is in.
  const [filled, setFilled] = useState(false);
  if (!filled && !catalogue.isLoading && (role || preset)) {
    setFilled(true);
    if (role) {
      setTitle(role.title);
      setDescription(role.description ?? '');
      setScope(role.data_scope ?? 'own');
      setSelected(minimalPermissions(catalogue.data, role.permission ?? []));
    } else if (preset) {
      setTitle(preset.title);
      setDescription(preset.description);
      setScope(preset.dataScope);
      setSelected(catalogue.data ? minimalPermissions(catalogue.data, resolvePreset(catalogue.data, preset)) : []);
    }
  }

  const effective = useMemo(() => expandPermissions(catalogue.data, selected), [catalogue.data, selected]);
  const picked = useMemo(() => new Set(selected), [selected]);
  const included = useMemo(() => new Set(effective), [effective]);
  const scopable = useMemo(() => (catalogue.data?.groups ?? []).flatMap((g) => g.features.filter((f) => f.scopable).map((f) => f.label)), [catalogue.data]);
  const verbLabel = useMemo(() => new Map((catalogue.data?.verbs ?? []).map((v) => [v.key, v.label])), [catalogue.data]);

  if (!isOwner) return <Redirect href="/(app)/(tabs)/more" />;
  if (id && roles.isLoading)
    return (
      <Screen title={t('roles.edit')} back>
        <Loading />
      </Screen>
    );
  if (id && !role)
    return (
      <Screen title={t('roles.edit')} back>
        <EmptyState title={t('roles.notFound')} action={t('common.back')} onAction={() => router.back()} />
      </Screen>
    );

  const toggle = (key: string) => setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const toggleFeature = (f: PermissionFeature) => {
    const all = f.actions.every((a) => included.has(a.key));
    const keysOf = f.actions.map((a) => a.key);
    setSelected((cur) => (all ? cur.filter((k) => !keysOf.includes(k)) : [...new Set([...cur, ...keysOf])]));
  };

  const appGroups = APP_PERMISSIONS.filter((g) =>
    g.id === 'leads' ? features.crm : g.id === 'followups' ? features.followups : g.id === 'services' ? features.services : true,
  );
  const toggleApp = (key: string) => setAppSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const save = async () => {
    const name = title.trim();
    if (!name) return showAlert(t('roles.titleRequired'));
    if (effective.length > MAX_PERMISSIONS) return showAlert(t('roles.tooMany', { max: MAX_PERMISSIONS }));
    setBusy(true);
    let roleId = role?.id ?? '';
    try {
      if (readOnly) {
        // Nothing to change on the server: only the app's own permissions.
      } else if (role) {
        await updateRole(token, role.id, {
          title: name,
          description: description.trim(),
          // Only what changed: re-sending data_scope would silently reset it for every holder.
          ...(sameSet(effective, role.permission ?? []) ? {} : { permission: effective }),
          ...(scope === (role.data_scope ?? 'own') ? {} : { data_scope: scope }),
        });
      } else {
        roleId = (await createRole(token, { title: name, description: description.trim() || undefined, permission: effective, data_scope: scope }))?.id ?? '';
      }
    } catch (err) {
      setBusy(false);
      return showAlert(t('common.couldNotSave'), err instanceof Error ? err.message : '');
    }
    try {
      if (roleId && appFilled && (!role || !sameSet(appSelected, savedApp.data ?? DEFAULT_APP_PERMISSIONS)))
        await saveRoleAppPermissions(roleId, readOnly && role ? role.title : name, appSelected);
      void qc.invalidateQueries({ queryKey: ['appPerms'] });
      void qc.invalidateQueries({ queryKey: ['roles'] });
      void qc.invalidateQueries({ queryKey: keys.team });
      router.back();
    } catch (err) {
      // The role itself is saved; only the app's part failed (e.g. no data store yet).
      void qc.invalidateQueries({ queryKey: ['roles'] });
      showAlert(t('roles.appSaveFailed'), err instanceof Error ? err.message : '');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!role) return;
    if ((role.members ?? 0) > 0) return showAlert(t('roles.inUseTitle'), t('roles.inUseBody', { count: role.members }));
    const ok = await confirmAction({
      title: t('roles.deleteTitle', { name: role.title }),
      message: t('roles.deleteBody'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteRole(token, role.id);
      void deleteRoleAppPermissions(role.id).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: ['roles'] });
      router.back();
    } catch (err) {
      showAlert(t('common.errorTitle'), err instanceof Error ? err.message : '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={role ? role.title : t('roles.new')}
      subtitle={readOnly ? t('roles.systemReadOnly') : t('roles.willSave', { count: effective.length })}
      back
      scroll
      right={<Button title={t('common.save')} size="sm" loading={busy} onPress={() => void save()} />}
    >
      <View style={{ gap: 14, marginTop: 8 }}>
        <Card style={{ gap: 12 }}>
          <Input
            label={t('roles.name')}
            placeholder={t('roles.namePlaceholder')}
            value={title}
            onChangeText={setTitle}
            editable={!readOnly}
            autoCapitalize="words"
          />
          <Input
            label={t('roles.description')}
            placeholder={t('roles.descriptionPlaceholder')}
            value={description}
            onChangeText={setDescription}
            editable={!readOnly}
            multiline
          />
        </Card>

        <Card style={{ gap: 10 }}>
          <Text variant="h3">{t('roles.recordAccess')}</Text>
          {readOnly ? (
            <Text>{scope === 'all' ? t('roles.scopeAll') : t('roles.scopeOwn')}</Text>
          ) : (
            <SegmentedControl<DataScope>
              value={scope}
              onChange={setScope}
              options={[
                { value: 'own', label: t('roles.scopeOwn') },
                { value: 'all', label: t('roles.scopeAll') },
              ]}
            />
          )}
          <Text variant="caption" tone="muted">
            {scope === 'all' ? t('roles.scopeAllHint') : t('roles.scopeOwnHint')}
          </Text>
          {scopable.length ? (
            <Text variant="micro" tone="faint">
              {t('roles.scopeAppliesTo', { list: scopable.join(', ') })}
            </Text>
          ) : null}
        </Card>

        <Card style={{ gap: 12 }}>
          <View style={{ gap: 4 }}>
            <Text variant="h3">{t('roles.appTitle')}</Text>
            <Text variant="caption" tone="muted">
              {t('roles.appHint')}
            </Text>
          </View>
          {!appFilled && savedApp.isError ? (
            <EmptyState
              title={t('roles.appLoadFailed', { defaultValue: "Couldn't load this role's app permissions" })}
              body={savedApp.error instanceof Error ? savedApp.error.message : ''}
              action={t('common.retry')}
              onAction={() => void savedApp.refetch()}
            />
          ) : !appFilled ? (
            <Loading />
          ) : (
            appGroups.map((g) => (
              <View key={g.id} style={{ gap: 6 }}>
                <Text variant="micro" tone="faint">
                  {t(`appPerm.group.${g.id}`).toUpperCase()}
                </Text>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {g.keys.map((k) => (
                    <Chip key={k} small label={t(appPermLabel(k))} selected={appSelected.includes(k)} onPress={() => toggleApp(k)} />
                  ))}
                </Row>
              </View>
            ))
          )}
        </Card>

        <Text variant="h3" style={{ marginStart: 4 }}>
          {t('roles.permissions')}
        </Text>
        {catalogue.isLoading ? (
          <Loading />
        ) : catalogue.isError || !catalogue.data ? (
          <EmptyState
            title={t('roles.catalogueFailed')}
            body={catalogue.error instanceof Error ? catalogue.error.message : ''}
            action={t('common.retry')}
            onAction={() => void catalogue.refetch()}
          />
        ) : (
          <>
            {!catalogue.data.enforced ? (
              <Text variant="caption" tone="warning" style={{ marginStart: 4 }}>
                {t('roles.notEnforced')}
              </Text>
            ) : null}
            {!readOnly ? (
              <Text variant="caption" tone="muted" style={{ marginStart: 4 }}>
                {t('roles.impliedHint')}
              </Text>
            ) : null}
            {catalogue.data.groups.map((g) => (
              <View key={g.name} style={{ gap: 6 }}>
                <Text variant="micro" tone="faint" style={{ marginStart: 4 }}>
                  {g.name.toUpperCase()}
                </Text>
                <Card padded={false}>
                  {g.features.map((f, i) => {
                    const all = f.actions.length > 1 && f.actions.every((a) => included.has(a.key));
                    return (
                      <View key={f.key}>
                        <View style={styles.feature}>
                          <Row gap={8} style={{ justifyContent: 'space-between' }}>
                            <View style={{ flex: 1, gap: 2 }}>
                              <Text variant="bodyStrong">{f.label}</Text>
                              {f.description ? (
                                <Text variant="caption" tone="muted">
                                  {f.description}
                                </Text>
                              ) : null}
                            </View>
                            {!f.entitled ? (
                              <StatusPill
                                label={f.inclusion?.name ? t('roles.needsPlan', { plan: f.inclusion.name }) : t('roles.notInPlan')}
                                color={colors.warning}
                              />
                            ) : null}
                          </Row>
                          <Row gap={6} style={{ flexWrap: 'wrap' }}>
                            {f.actions.map((a) => {
                              const label = a.label || verbLabel.get(a.verb) || a.verb;
                              const implied = included.has(a.key) && !picked.has(a.key);
                              if (readOnly && !included.has(a.key)) return null;
                              if (readOnly || implied)
                                return (
                                  <Chip
                                    key={a.key}
                                    small
                                    label={label}
                                    tone="primary"
                                    icon={implied && !readOnly ? <Lock size={11} color={colors.primary} /> : undefined}
                                  />
                                );
                              return <Chip key={a.key} small label={label} selected={picked.has(a.key)} onPress={() => toggle(a.key)} />;
                            })}
                            {!readOnly && f.actions.length > 1 ? (
                              <Chip small label={all ? t('roles.clearAll') : t('roles.selectAll')} tone="accent" onPress={() => toggleFeature(f)} />
                            ) : null}
                          </Row>
                        </View>
                        {i < g.features.length - 1 ? <Divider /> : null}
                      </View>
                    );
                  })}
                </Card>
              </View>
            ))}
          </>
        )}

        {role && !readOnly ? (
          <Button
            title={t('roles.delete')}
            variant="danger"
            icon={<Trash2 size={14} color={colors.danger} />}
            loading={busy}
            onPress={() => void remove()}
            full
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ feature: { padding: 12, gap: 10 } });
