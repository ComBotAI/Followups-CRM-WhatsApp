/**
 * Visits setup: pick the kind of business, review what will be created (visit
 * types, guest details, the messages that bring guests back, with their
 * wording), switch off anything unwanted, and set it all up in one go.
 * Everything created stays editable (Services, Auto Followup, Lead fields).
 */
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Car,
  Check,
  CheckCircle2,
  Dumbbell,
  GraduationCap,
  PawPrint,
  Scissors,
  ShoppingBag,
  Stethoscope,
  Store,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { RequireCan } from '@/components/RequireCan';
import { Button, Chip, Group, Input, Row, Screen, SectionHeader, Switch, Text } from '@/components/ui';
import { useDesktop } from '@/hooks/useDesktop';
import { humanMinutes } from '@/lib/followups';
import { showAlert } from '@/lib/dialog';
import { P } from '@/lib/permissions';
import { describeCrmError } from '@/services/crm/client';
import { MINUTES } from '@/services/crm/sequences';
import { INDUSTRIES, industryOf, localizeIndustry, type Industry, type IndustryRule } from '@/services/visits/industries';
import { applyIndustry, type SetupReport } from '@/services/visits/setup';
import { useAccountsStore, useActiveSession } from '@/stores/accounts';
import { armAllOccasions } from '@/services/crm/services';
import { runJob } from '@/services/work';
import { useVisitsConfig, useVisitsStore } from '@/stores/visits';
import { useTheme } from '@/theme/ThemeProvider';

const ICONS: Record<Industry['icon'], typeof Store> = {
  utensils: UtensilsCrossed,
  scissors: Scissors,
  stethoscope: Stethoscope,
  dumbbell: Dumbbell,
  car: Car,
  wrench: Wrench,
  shopping: ShoppingBag,
  paw: PawPrint,
  graduation: GraduationCap,
  store: Store,
};

/** Step 1: the kind of business. */
function IndustryGrid({ value, onPick }: { value: string | null; onPick: (i: Industry) => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const desktop = useDesktop();
  return (
    <View style={styles.grid}>
      {INDUSTRIES.map((raw) => localizeIndustry(raw, t)).map((i) => {
        const Icon = ICONS[i.icon];
        const on = value === i.key;
        return (
          <Pressable
            key={i.key}
            onPress={() => onPick(i)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.card,
              { width: desktop ? '31.8%' : '48%' },
              {
                borderRadius: radius.lg,
                borderColor: on ? colors.primary : hovered ? colors.borderStrong : colors.border,
                backgroundColor: on ? colors.primarySoft : pressed ? colors.surfaceAlt : colors.surface,
              },
            ]}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={[styles.cardIcon, { backgroundColor: on ? colors.primary : colors.surfaceAlt }]}>
                <Icon size={18} color={on ? '#fff' : colors.text} />
              </View>
              {on ? <Check size={18} color={colors.primary} /> : null}
            </Row>
            <Text variant="bodyStrong" numberOfLines={1}>
              {i.name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={3}>
              {i.blurb}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One message rule: switch, name, when, and its wording. */
function RuleRow({
  title,
  when,
  text,
  on,
  onChange,
  last,
}: {
  title: string;
  when: string;
  text: string;
  on: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.rule, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={12}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="caption" tone="muted">
            {when}
          </Text>
        </View>
        <Switch value={on} onChange={onChange} label={title} />
      </Row>
      {on ? (
        <View style={[styles.bubble, { backgroundColor: colors.scheme === 'dark' ? '#0F2A20' : '#E7F8EE', borderRadius: radius.md }]}>
          <Text variant="caption" style={{ lineHeight: 19 }}>
            {text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Setup() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const config = useVisitsConfig();
  const session = useActiveSession();
  // In the app's language: what is created (names, wording) is too.
  const [industry, setIndustry] = useState<Industry | null>(() => {
    const i = industryOf(config.industry);
    return i ? localizeIndustry(i, t) : null;
  });
  const [business, setBusiness] = useState(config.business || session?.workspaceName || '');
  const [reviewLink, setReviewLink] = useState(config.reviewLink);
  // When a guest counts as a Regular, and a VIP (visits).
  const [regularAt, setRegularAt] = useState(String(config.regularAt));
  const [vipAt, setVipAt] = useState(String(config.vipAt));
  const [services, setServices] = useState<string[]>(() => industry?.services.map((s) => s.key) ?? []);
  const [rules, setRules] = useState<string[]>(() => defaultRules(industry));
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<SetupReport | null>(null);

  const pick = (i: Industry) => {
    setIndustry(i);
    setServices(i.services.map((s) => s.key));
    setRules(defaultRules(i));
  };
  const toggle = (list: string[], key: string, on: boolean) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key));
  const ruleWhen = (r: IndustryRule) => r.description;
  const recallWhen = (days: number) => t('visits.recallWhen', { when: humanMinutes(days * MINUTES.days, t) });

  const apply = async () => {
    if (!industry) return;
    const regular = Number(regularAt);
    const vip = Number(vipAt);
    if (!Number.isInteger(regular) || !Number.isInteger(vip) || regular < 1 || vip <= regular)
      return showAlert(t('visits.badTiers', { defaultValue: 'VIP needs more visits than Regular, and Regular at least 1.' }));
    setBusy('fields');
    try {
      const res = await applyIndustry({ industry, business, reviewLink, services, rules }, setBusy);
      // Tier thresholds apply from each guest's next visit.
      const acctId = useAccountsStore.getState().activeId;
      if (acctId) useVisitsStore.getState().set(acctId, { regularAt: regular, vipAt: vip });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['services'] }),
        qc.invalidateQueries({ queryKey: ['wa', 'sequences'] }),
        qc.invalidateQueries({ queryKey: ['fields'] }),
      ]);
      setReport(res);
      // Guests who already have a birthday / anniversary get their wishes armed, in the background.
      const acct = useAccountsStore.getState().activeId;
      if (acct && industry.rules.some((r) => r.trigger.kind === 'occasion' && rules.includes(r.key)))
        void runJob(acct, t('visits.armingDates'), (forAcct, progress) => armAllOccasions(progress, forAcct)).catch(() => undefined);
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setBusy(null);
    }
  };

  if (report) {
    return (
      <Screen title={t('visits.setupTitle')} back>
        <View style={styles.done}>
          <View style={[styles.doneIcon, { backgroundColor: colors.primarySoft }]}>
            <CheckCircle2 size={34} color={colors.primary} />
          </View>
          <Text variant="h1" center>
            {t('visits.applied')}
          </Text>
          <Text tone="muted" center style={{ maxWidth: 360 }}>
            {t('visits.appliedBody', { services: report.services, fields: report.fields, automations: report.automations })}
          </Text>
          {report.skipped.length ? (
            <Text variant="caption" tone="warning" center>
              {t('visits.skipped', { names: report.skipped.join(', ') })}
            </Text>
          ) : null}
          <Button
            title={t('visits.checkIn')}
            size="lg"
            style={{ alignSelf: 'stretch', marginTop: 20 }}
            onPress={() => router.replace('/(app)/visits/check-in')}
          />
          <Button title={t('visits.goToVisits')} variant="secondary" style={{ alignSelf: 'stretch' }} onPress={() => router.replace('/(app)/visits')} />
        </View>
      </Screen>
    );
  }

  const withDays = industry?.recall ? industry.services.filter((s) => s.days && services.includes(s.key)) : [];
  return (
    <Screen
      title={t('visits.setupTitle')}
      subtitle={t('visits.setupSub')}
      back
      scroll
      maxWidth={760}
      footer={
        industry ? (
          <Button
            title={busy ? t(`visits.applying.${busy}`, { defaultValue: t('visits.applyingAny') }) : t('visits.apply')}
            size="lg"
            loading={!!busy}
            disabled={!services.length}
            onPress={() => void apply()}
          />
        ) : undefined
      }
    >
      <View style={{ gap: 26, marginTop: 4 }}>
        <View style={{ gap: 12 }}>
          <SectionHeader title={t('visits.industryTitle')} />
          <IndustryGrid value={industry?.key ?? null} onPick={pick} />
        </View>

        {industry ? (
          <>
            <View style={{ gap: 14 }}>
              <SectionHeader title={t('visits.aboutBusiness')} />
              <Input label={t('visits.business')} value={business} onChangeText={setBusiness} hint={t('visits.businessHint')} autoCapitalize="words" />
              <Input
                label={t('visits.reviewLink')}
                value={reviewLink}
                onChangeText={setReviewLink}
                hint={t('visits.reviewLinkHint')}
                placeholder="https://g.page/r/…"
                keyboardType="url"
              />
              <Row gap={12} style={{ alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label={t('visits.regularAt', { defaultValue: 'Regular from (visits)' })}
                    value={regularAt}
                    onChangeText={(v) => setRegularAt(v.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label={t('visits.vipAt', { defaultValue: 'VIP from (visits)' })}
                    value={vipAt}
                    onChangeText={(v) => setVipAt(v.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                  />
                </View>
              </Row>
              <Text variant="caption" tone="faint">
                {t('visits.tiersHint', { defaultValue: 'A guest’s tier updates at their next visit.' })}
              </Text>
            </View>

            <View style={{ gap: 12 }}>
              <SectionHeader title={t('visits.servicesTitle')} />
              <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {industry.services.map((s) => (
                  <Chip
                    key={s.key}
                    label={s.name}
                    selected={services.includes(s.key)}
                    onPress={() => setServices((cur) => toggle(cur, s.key, !cur.includes(s.key)))}
                  />
                ))}
              </Row>
            </View>

            <View style={{ gap: 12 }}>
              <SectionHeader title={t('visits.automationsTitle')} />
              <Group>
                {industry.rules.map((r, i) => (
                  <RuleRow
                    key={r.key}
                    title={r.name}
                    when={ruleWhen(r)}
                    text={r.steps[0]?.text ?? ''}
                    on={rules.includes(r.key)}
                    onChange={(v) => setRules((cur) => toggle(cur, r.key, v))}
                    last={i === industry.rules.length - 1 && !withDays.length}
                  />
                ))}
                {withDays.map((s, i) => (
                  <RuleRow
                    key={s.key}
                    title={industry.recallName?.(s.name) ?? `${s.name} reminder`}
                    when={recallWhen(s.days!)}
                    text={(industry.recall ?? '').replace(/\[\[service\]\]/g, s.name.toLowerCase())}
                    on={rules.includes(`recall:${s.key}`)}
                    onChange={(v) => setRules((cur) => toggle(cur, `recall:${s.key}`, v))}
                    last={i === withDays.length - 1}
                  />
                ))}
              </Group>
              <Text variant="caption" tone="faint">
                {t('visits.wordingHint')}
              </Text>
            </View>

            {industry.fields.length ? (
              <View style={{ gap: 12 }}>
                <SectionHeader title={t('visits.fieldsTitle')} />
                <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  {[
                    t('visits.field.visits'),
                    t('visits.field.spent'),
                    t('visits.field.tier'),
                    t('visits.field.birthday'),
                    ...industry.fields.map((f) => f.name),
                  ].map((n) => (
                    <View key={n} style={[styles.tag, { backgroundColor: colors.surfaceAlt }]}>
                      <Text variant="caption">{n}</Text>
                    </View>
                  ))}
                </Row>
              </View>
            ) : null}
            {busy ? <ActivityIndicator color={colors.primary} /> : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

/** Recommended rules plus every service's "due again" reminder. */
const defaultRules = (i: Industry | null | undefined): string[] =>
  i ? [...i.rules.filter((r) => r.recommended).map((r) => r.key), ...i.services.filter((s) => s.days).map((s) => `recall:${s.key}`)] : [];

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  card: { borderWidth: 1, padding: 14, gap: 8, minHeight: 132 },
  cardIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rule: { padding: 14, gap: 10 },
  bubble: { padding: 12, borderTopLeftRadius: 4 },
  tag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60, maxWidth: 420, width: '100%', alignSelf: 'center' },
  doneIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
});

/** Setting up changes the workspace: owners and members allowed to manage Services. */
export default function SetupGate() {
  // One form per account: a switch while it's open starts it fresh, never saving into the other account.
  const acct = useAccountsStore((s) => s.activeId);
  return (
    <RequireCan any={[P.app.services]}>
      <Setup key={acct ?? 'none'} />
    </RequireCan>
  );
}
