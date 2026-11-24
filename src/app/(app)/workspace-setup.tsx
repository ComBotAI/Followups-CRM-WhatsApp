/**
 * The setup journey a workspace owner goes through after signing in, whenever
 * the workspace is missing what the app runs on (nothing is created silently):
 *
 *   1. Lead fields: one button creates the custom fields.
 *   2. Data store: pick one of the CPaaS data store plans (and a cycle if it is
 *      paid), then the store is created on it and its tables are added.
 *
 * "Skip for now" lets the owner in; they are asked again on the next sign-in.
 */
import type { DataStorePlan } from '@ab-ecosystem/cpaas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Check, CircleCheck, Database, Sliders } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Row, Screen, Text } from '@/components/ui';
import { keys } from '@/hooks/queries';
import { skipWorkspaceSetup, useWorkspaceSetupStatus } from '@/hooks/useWorkspaceSetup';
import { describeCrmError } from '@/services/crm/client';
import { previewCatalogue, previewSetup } from '@/lib/previewSetup';
import { cachedHandle, ensureDataStore, STORE_TITLE } from '@/services/crm/datastore';
import { listTenuredPlans, normaliseTenure } from '@/services/crm/storePlans';
import { ensureLeadSchema, LEAD_FIELDS } from '@/services/crm/schema';
import { useAccountsStore } from '@/stores/accounts';
import { useIsOwner } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * "30D" → "30 days", "360D" → "360 days", "LTD" → "lifetime". Exact day counts, never rounded to
 * "month" or "year", so the data store's tenure reads the same as the subscription plan's.
 */
const cycleLabel = (cycle: string, t: (k: string, o?: Record<string, unknown>) => string) => {
  const c = normaliseTenure(cycle);
  if (c === 'LTD') return t('wsetup.lifetime', { defaultValue: 'lifetime' });
  const days = Number(c.replace(/D$/, '')) || 0;
  return t('wsetup.days', { count: days, defaultValue: '{{count}} days' });
};

const formatBytes = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
};

export default function WorkspaceSetupScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const acct = useAccountsStore((s) => s.activeId);
  const isOwner = useIsOwner();
  const status = useWorkspaceSetupStatus();

  const [busy, setBusy] = useState<'fields' | 'store' | null>(null);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);

  // Dev web preview only (`?preview=1&setup=low`): sample plans and wallet, no server.
  const [mock] = useState(previewSetup);
  const fieldsDone = !!mock || (status.fieldsKnown && status.missingFields === 0);
  const storeDone = !mock && status.store === 'ok';
  const needPlan = !!mock || status.store === 'missing';

  const plans = useQuery({
    // Own key: the unfiltered catalogue must never be served from cache here.
    queryKey: ['datastorePlans', 'byTenure', acct],
    queryFn: () => (mock ? Promise.resolve(previewCatalogue(mock)) : listTenuredPlans(acct)),
    enabled: isOwner && fieldsDone && needPlan,
    staleTime: 5 * 60_000,
  });
  const catalogue = plans.data;
  const allowance = catalogue?.allowance;
  const noRoom = !!allowance?.capped && allowance.used >= (allowance.limit ?? 0);
  // No plan is sold for the main plan's tenure: the store can't be bought from here.
  const noTenure = !!catalogue?.noMatch;

  const [pickedId, setPlanId] = useState<string | null>(null);
  // Until the owner picks, the default plan (or the first) is selected.
  const fallback = catalogue?.plans.find((p) => p.default) ?? catalogue?.plans[0];
  const planId = pickedId ?? fallback?.id ?? null;
  const selected = catalogue?.plans.find((p) => p.id === planId) ?? null;
  // Paid plans were already narrowed to the subscription plan's tenure, so their only cycle is that tenure.
  const cycle = !selected?.paid ? null : (selected.cycles[0] ?? null);

  const pick = (p: DataStorePlan) => setPlanId(p.id);

  const createFields = async () => {
    setBusy('fields');
    setFieldsError(null);
    try {
      const { report } = await ensureLeadSchema(acct);
      if (report.planLimited)
        setFieldsError(
          // The server's own words too (e.g. "Plan limit reached for custom fields (12/50)"), so a wrong refusal shows as one.
          [
            t('wsetup.fieldsLimited', { defaultValue: 'Your subscription has no room for more custom fields. Some fields could not be created.' }),
            report.failed[0]?.reason,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      else if (report.failed.length)
        setFieldsError(
          t('wsetup.fieldsFailed', {
            count: report.failed.length,
            defaultValue: '{{count}} fields could not be created: {{list}}',
            list: report.failed.map((f) => f.reason).join(', '),
          }),
        );
    } catch (err) {
      setFieldsError(describeCrmError(err));
    } finally {
      await qc.invalidateQueries({ queryKey: keys.fields });
      setBusy(null);
    }
  };

  const createStore = async () => {
    if (!acct) return;
    setBusy('store');
    setStoreError(null);
    try {
      const plan = needPlan && selected ? { plan: selected.id, ...(selected.paid && cycle ? { duration: cycle } : {}) } : undefined;
      const handle = await ensureDataStore(true, acct, { create: true, plan });
      if (!handle.available) setStoreError(handle.reason ?? t('common.errorTitle'));
    } catch (err) {
      setStoreError(describeCrmError(err));
    } finally {
      setBusy(null);
    }
  };

  const finish = () => router.replace('/');
  const skip = () => {
    skipWorkspaceSetup(acct);
    router.replace('/');
  };

  if (!isOwner) {
    return (
      <Screen title={t('wsetup.title', { defaultValue: 'Set up your workspace' })} back scroll>
        <Card style={{ gap: 8, marginTop: 8 }}>
          <Text variant="h3">{t('wsetup.memberTitle', { defaultValue: 'Waiting for the workspace owner' })}</Text>
          <Text variant="caption" tone="muted">
            {t('wsetup.memberBody', {
              defaultValue: 'Only the owner can create the fields and the data store. Until then, visits and follow-ups stay on this phone and upload later.',
            })}
          </Text>
          <Button title={t('common.continue', { defaultValue: 'Continue' })} onPress={finish} style={{ marginTop: 6 }} />
        </Card>
      </Screen>
    );
  }

  const price = (p: DataStorePlan, c: string | null) => {
    if (!p.paid) return t('wsetup.free', { defaultValue: 'Free' });
    const amount = c ? p.pricing[c] : undefined;
    return amount == null ? '' : `${p.currency ?? ''} ${amount.toLocaleString()} / ${cycleLabel(c ?? '', t)}`.trim();
  };

  return (
    <Screen
      title={t('wsetup.title', { defaultValue: 'Set up your workspace' })}
      subtitle={t('wsetup.subtitle', { defaultValue: 'Two quick steps before you start: your lead fields and your data store.' })}
      scroll
      footer={
        <View style={{ gap: 8 }}>
          {status.complete ? (
            <Button title={t('wsetup.done', { defaultValue: 'Start using the app' })} onPress={finish} />
          ) : (
            <Button title={t('wsetup.skip', { defaultValue: 'Skip for now' })} variant="ghost" onPress={skip} />
          )}
        </View>
      }
    >
      <View style={{ gap: 14, marginTop: 8 }}>
        <Step
          n={1}
          done={fieldsDone}
          icon={<Sliders size={18} color={colors.primary} />}
          title={t('wsetup.step1', { defaultValue: 'Create lead fields' })}
          body={
            status.fieldsKnown
              ? t('wsetup.fieldsCount', {
                  defaultValue: '{{have}} of {{total}} fields exist (status, contact type, follow-up, product…).',
                  have: LEAD_FIELDS.length - status.missingFields,
                  total: LEAD_FIELDS.length,
                })
              : t('wsetup.checking', { defaultValue: 'Checking…' })
          }
        >
          {fieldsError ? (
            <Text variant="caption" tone="danger">
              {fieldsError}
            </Text>
          ) : null}
          {!fieldsDone ? (
            <Button
              title={t('wsetup.createFields', { defaultValue: 'Create fields' })}
              loading={busy === 'fields'}
              disabled={!status.fieldsKnown}
              onPress={() => void createFields()}
            />
          ) : null}
        </Step>

        <Step
          n={2}
          done={storeDone}
          icon={<Database size={18} color={colors.primary} />}
          title={t('wsetup.step2', { defaultValue: 'Create the data store' })}
          body={
            storeDone
              ? t('wsetup.storeOk', { defaultValue: 'Data store “{{name}}” is ready with all its tables.', name: STORE_TITLE })
              : status.store === 'tables'
                ? t('wsetup.storeTables', { defaultValue: 'Your data store exists. Some tables are missing for the features you have on.' })
                : t('wsetup.storeBody', { defaultValue: 'Remarks, reminders, visits and follow-ups are kept here. Choose a plan for it.' })
          }
          dim={!fieldsDone}
        >
          {!fieldsDone || storeDone ? null : status.store === 'refused' ? (
            <Text variant="caption" tone="danger">
              {t('wsetup.storeRefused', { defaultValue: 'Your subscription does not allow a data store right now. Contact your provider, then try again.' })}
            </Text>
          ) : status.store === 'tables' ? (
            <Button title={t('wsetup.addTables', { defaultValue: 'Add missing tables' })} loading={busy === 'store'} onPress={() => void createStore()} />
          ) : needPlan ? (
            <View style={{ gap: 10 }}>
              {plans.isLoading ? (
                <Text variant="caption" tone="muted">
                  {t('wsetup.loadingPlans', { defaultValue: 'Loading plans…' })}
                </Text>
              ) : plans.error ? (
                <View style={{ gap: 8 }}>
                  <Text variant="caption" tone="danger">
                    {describeCrmError(plans.error)}
                  </Text>
                  <Button title={t('common.retry', { defaultValue: 'Try again' })} variant="secondary" size="sm" onPress={() => void plans.refetch()} />
                </View>
              ) : noRoom ? (
                <Text variant="caption" tone="danger">
                  {t('wsetup.noRoom', { defaultValue: 'Your subscription allows no more data stores ({{used}} used).', used: allowance?.used ?? 0 })}
                </Text>
              ) : noTenure ? (
                <Text variant="caption" tone="danger">
                  {catalogue?.tenure
                    ? t('wsetup.noTenure', {
                        defaultValue: 'No data store plan is available for your subscription period ({{period}}). Contact your admin for data store plans.',
                        period: cycleLabel(catalogue.tenure, t),
                      })
                    : t('wsetup.noTenureUnknown', { defaultValue: 'No data store plan matches your subscription. Contact your admin for data store plans.' })}
                </Text>
              ) : !catalogue?.plans.length ? (
                <Text variant="caption" tone="muted">
                  {t('wsetup.noPlans', { defaultValue: 'No plans are offered: the store will be created on the default plan.' })}
                </Text>
              ) : (
                <>
                  {catalogue.tenure && catalogue.plans.some((p) => p.paid) ? (
                    <Text variant="caption" tone="muted">
                      {t('wsetup.tenure', {
                        defaultValue: 'Tenure: {{period}}, the same as your subscription plan.',
                        period: cycleLabel(catalogue.tenure, t),
                      })}
                    </Text>
                  ) : null}
                  {catalogue.plans.map((p) => {
                    const on = p.id === planId;
                    const limits = [
                      p.storageBytes != null ? t('wsetup.storage', { defaultValue: '{{size}} storage', size: formatBytes(p.storageBytes) }) : null,
                      p.rateLimit != null ? t('wsetup.rate', { defaultValue: '{{count}} requests/s', count: p.rateLimit }) : null,
                    ].filter(Boolean);
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => pick(p)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={[
                          styles.plan,
                          {
                            borderRadius: radius.lg,
                            borderColor: on ? colors.primary : colors.border,
                            backgroundColor: on ? colors.primarySoft : colors.surface,
                          },
                        ]}
                      >
                        <Row gap={8}>
                          <Text variant="bodyStrong" style={{ flex: 1 }}>
                            {p.name}
                          </Text>
                          <Text variant="caption" tone={on ? 'primary' : 'muted'} style={{ fontWeight: '600' }}>
                            {price(p, on ? cycle : (p.cycles[0] ?? null))}
                          </Text>
                          {on ? <Check size={16} color={colors.primary} /> : null}
                        </Row>
                        {p.caption ? (
                          <Text variant="caption" tone="muted">
                            {p.caption}
                          </Text>
                        ) : null}
                        {limits.length ? (
                          <Text variant="caption" tone="faint">
                            {limits.join(' · ')}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </>
              )}
              {selected?.paid ? (
                <Text variant="caption" tone="muted">
                  {t('wsetup.paidNote', { defaultValue: 'The plan is charged to your wallet when the store is created.' })}
                </Text>
              ) : null}
              <Button
                title={t('wsetup.createStore', { defaultValue: 'Create data store' })}
                loading={busy === 'store'}
                disabled={plans.isLoading || !!plans.error || noRoom || noTenure || (!!catalogue?.plans.length && !selected) || (!!selected?.paid && !cycle)}
                onPress={() => void createStore()}
              />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Text variant="caption" tone="muted">
                {cachedHandle(acct)?.reason || t('wsetup.checking', { defaultValue: 'Checking…' })}
              </Text>
              <Button
                title={t('setup.checkAgain', { defaultValue: 'Check again' })}
                variant="secondary"
                size="sm"
                loading={busy === 'store'}
                onPress={() => {
                  setBusy('store');
                  void ensureDataStore(true, acct).finally(() => setBusy(null));
                }}
              />
            </View>
          )}
          {storeError ? (
            <Text variant="caption" tone="danger">
              {storeError}
            </Text>
          ) : null}
        </Step>
      </View>
    </Screen>
  );
}

function Step({
  n,
  done,
  icon,
  title,
  body,
  dim,
  children,
}: {
  n: number;
  done: boolean;
  icon: ReactNode;
  title: string;
  body: string;
  dim?: boolean;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Card style={{ gap: 10, opacity: dim ? 0.55 : 1 }}>
      <Row gap={10}>
        <View style={[styles.badge, { backgroundColor: done ? colors.success : colors.primarySoft }]}>
          {done ? (
            <CircleCheck size={16} color="#fff" />
          ) : (
            <Text variant="micro" tone="primary">
              {n}
            </Text>
          )}
        </View>
        {icon}
        <Text variant="h3" style={{ flex: 1 }}>
          {title}
        </Text>
      </Row>
      <Text variant="caption" tone="muted">
        {body}
      </Text>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  plan: { borderWidth: 1.5, padding: 12, gap: 4 },
});
