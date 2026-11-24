/**
 * Follow-up series editor, laid out as the series reads:
 *
 *   name (and on/off)
 *   When does it start?   one row; the choices open in a sheet, each explained
 *   Messages              a timeline: "wait 1 day" → the message, as WhatsApp shows it
 *   More options          description, channel, stop rules, repeat (closed by default)
 *
 * Saved to the shared data store.
 */
import type { Template } from '@ab-ecosystem/cpaas';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import {
  CalendarHeart,
  ChevronDown,
  ChevronRight,
  Filter,
  Gift,
  Hand,
  MoreHorizontal,
  Paperclip,
  Plus,
  Repeat,
  Sparkles,
  Store,
  Trash2,
  UserPlus,
  Wrench,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { FilterSheet } from '@/components/leads/FilterSheet';
import { TemplatePreview } from '@/components/whatsapp/TemplatePreview';
import { VariableMapper } from '@/components/whatsapp/VariableMapper';
import { ConditionSummary } from '@/components/leads/ConditionSummary';
import { ChannelSelect } from '@/components/whatsapp/ChannelSelect';
import { isSessionReady, SessionComposer } from '@/components/whatsapp/SessionComposer';
import { Button, Chip, EmptyState, Group, GroupRow, Input, Row, Screen, SectionHeader, SegmentedControl, Sheet, Switch, Text } from '@/components/ui';
import { useLeadOptions, useSequences, useServices, useTemplates, useWaChannels, waKeys } from '@/hooks/queries';
import { confirmAction, showAlert } from '@/lib/dialog';
import { countActiveFilters, type LeadFilter } from '@/lib/filters';
import { MAX_BYTES, pickForFormat } from '@/lib/pickFile';
import { describeCrmError } from '@/services/crm/client';
import {
  conditionNarrowed,
  conditionProblem,
  cumulativeMinutes,
  deleteSequence,
  DELAY_UNITS,
  saveSequence,
  type Sequence,
  type SequenceRepeat,
  type SequenceStep,
  type SequenceTrigger,
} from '@/services/crm/sequences';
import { parseTemplate, slotsOf, uploadSendMedia, type MediaFormat } from '@/services/crm/whatsapp';
import { useMyId } from '@/stores/auth';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import { F, isUserField } from '@/services/crm/schema';
import { useAccountsStore } from '@/stores/accounts';
import { useTheme } from '@/theme/ThemeProvider';
import { humanMinutes, triggerLabel } from '@/lib/followups';
import { rtlFlip } from '@/lib/rtl';
import { useFeatures } from '@/stores/features';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';

const uid = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Says when a condition has more choices than one check can combine: only the first of those is used. */
function NarrowedNote({ filter }: { filter: LeadFilter | undefined }) {
  const { t } = useTranslation();
  const fields = conditionNarrowed(filter);
  if (!fields.length) return null;
  const fieldName = (slug: string) =>
    slug === F.status ? t('common.status') : slug === F.contactType ? t('leads.contactType') : slug === F.assignedName ? t('filter.assignedTo') : slug;
  return (
    <Text variant="caption" tone="warning">
      {t('filter.narrowed', {
        defaultValue: 'Too many choices to combine: only the first {{fields}} picked is used. Pick fewer to see everything.',
        fields: fields.map(fieldName).join(', '),
      })}
    </Text>
  );
}

function EditSequence() {
  const { t } = useTranslation();
  // From Settings → Services: a new reminder series for that service.
  const { id, serviceId, name, days } = useLocalSearchParams<{ id?: string; serviceId?: string; name?: string; days?: string }>();
  const sequences = useSequences();
  const config = useWhatsAppConfig();
  const existing = id ? sequences.data?.find((s) => s.id === id) : undefined;
  if (id && sequences.isLoading) return <ActivityIndicator style={{ flex: 1 }} />;
  // A series that no longer exists (or failed to load) must not open as a blank one that saves a duplicate.
  if (id && !existing)
    return (
      <Screen title={t('followup.title')} back>
        <EmptyState
          title={t('followup.notFound')}
          body={sequences.error ? describeCrmError(sequences.error) : undefined}
          action={t('common.retry')}
          onAction={() => void sequences.refetch()}
        />
      </Screen>
    );
  return (
    <Editor
      key={existing?.id ?? 'new'}
      initial={existing}
      preset={!existing && serviceId ? { serviceId, name: name ?? '', days: Number(days) || 0 } : undefined}
      channelId={existing?.channelId || config.channelId || ''}
    />
  );
}

function Editor({
  initial,
  preset,
  channelId: initialChannel,
}: {
  initial?: Sequence;
  preset?: { serviceId: string; name: string; days: number };
  channelId: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const myId = useMyId();
  const channels = useWaChannels();
  const [channelId, setChannelId] = useState(initialChannel);
  // WhatsApp app (no API): no channel, and steps are text messages sent by hand.
  const api = useWhatsAppConfig().mode === 'api';
  const templates = useTemplates(channelId, 'approved');
  const options = useLeadOptions();
  const [name, setName] = useState(initial?.name ?? preset?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [steps, setSteps] = useState<SequenceStep[]>(
    () =>
      initial?.steps ??
      // A service's reminder: one step at the usual gap, message left to the user.
      (preset?.days
        ? [
            {
              id: uid(),
              wait:
                preset.days % 30 === 0
                  ? { value: preset.days / 30, unit: 'months' }
                  : preset.days % 7 === 0
                    ? { value: preset.days / 7, unit: 'weeks' }
                    : { value: preset.days, unit: 'days' },
              ...(api ? {} : { kind: 'session' as const, session: { type: 'text' as const, text: '' } }),
              templateId: '',
              templateName: '',
              language: '',
              mapping: {},
            },
          ]
        : []),
  );
  const [keepIf, setKeepIf] = useState<LeadFilter>(initial?.keepIf ?? { statuses: undefined });
  const [onFail, setOnFail] = useState<Sequence['onFail']>(initial?.onFail ?? 'cancel_series');
  const [trigger, setTrigger] = useState<SequenceTrigger>(initial?.trigger ?? (preset ? { kind: 'service', serviceId: preset.serviceId } : { kind: 'manual' }));
  const services = useServices();
  const servicesOn = useFeatures().services;
  const [repeat, setRepeat] = useState<SequenceRepeat | null>(initial?.repeat ?? null);
  const [active, setActive] = useState(initial?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);
  const offsets = cumulativeMinutes(steps);

  // By id and from the latest list: a header upload finishing later must not undo edits made meanwhile.
  const patchStep = (id: string, patch: Partial<SequenceStep>) => setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addStep = () =>
    setSteps([
      ...steps,
      {
        id: uid(),
        wait: steps.length ? { value: 1, unit: 'days' } : { value: 0, unit: 'minutes' },
        ...(api ? {} : { kind: 'session' as const, session: { type: 'text' as const, text: '' } }),
        templateId: '',
        templateName: '',
        language: '',
        mapping: {},
      },
    ]);

  const save = async () => {
    if (!name.trim()) return showAlert(t('followup.needName'));
    if (!steps.length) return showAlert(t('followup.needSteps'));
    if (steps.some((s) => (s.kind === 'session' ? !s.session || !isSessionReady(s.session) : !s.templateId))) return showAlert(t('followup.needContent'));
    if (api && !channelId) return showAlert(t('wa.noChannelTitle'));
    // Each template step complete: every variable mapped and a media header attached (else every send fails).
    for (const s of steps) {
      if (s.kind === 'session') continue;
      const tpl = templates.data?.find((x) => x.id === s.templateId);
      if (!tpl) continue;
      const parsed = parseTemplate(tpl.components);
      if (slotsOf(parsed).some((slot) => !s.mapping?.[slot.key])) return showAlert(t('wa.fillVariables'));
      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(parsed.header.format) && !s.headerMedia) return showAlert(t('wa.needMedia'));
    }
    const conditionIssue = conditionProblem(keepIf) ?? steps.map((s) => conditionProblem(s.onlyIf)).find(Boolean);
    if (conditionIssue) return showAlert(conditionIssue);
    setSaving(true);
    try {
      const forService = trigger.kind === 'service';
      await saveSequence({
        id: initial?.id,
        name,
        description,
        channelId,
        steps,
        keepIf,
        onFail,
        trigger,
        active,
        createdBy: initial?.createdBy || myId,
        repeat: forService ? repeat : null,
      });
      await qc.invalidateQueries({ queryKey: waKeys.sequences });
      goBack();
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!initial) return;
    const ok = await confirmAction({
      title: t('followup.deleteTitle', { name: initial.name }),
      message: t('followup.deleteBody'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteSequence(initial.id);
    } catch (e) {
      // Failed: stay on the page rather than look deleted.
      return showAlert(t('common.errorTitle'), describeCrmError(e));
    }
    await qc.invalidateQueries({ queryKey: waKeys.sequences });
    goBack();
  };

  const [startOpen, setStartOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(
    () => !!(initial?.description || countActiveFilters(initial?.keepIf ?? {}) || initial?.repeat),
  );
  const serviceName = (sid: string) => services.data?.find((x) => x.id === sid)?.name;
  const startLabel = triggerLabel({ trigger }, t, serviceName);

  return (
    <Screen
      title={initial ? t('followup.edit') : t('followup.new')}
      back
      scroll
      maxWidth={720}
      right={
        <Row gap={8}>
          <Text variant="caption" tone="muted">
            {active ? t('followup.active') : t('followup.paused')}
          </Text>
          <Switch value={active} onChange={setActive} />
        </Row>
      }
      footer={
        <Row gap={10}>
          {initial ? (
            <Button title={t('common.delete')} variant="ghost" icon={<Trash2 size={16} color={colors.danger} />} onPress={() => void remove()} />
          ) : null}
          <Button title={t('followup.save')} loading={saving} onPress={() => void save()} style={{ flex: 1 }} />
        </Row>
      }
    >
      <View style={{ gap: 28, marginTop: 4, paddingBottom: 24 }}>
        <Input label={t('followup.name')} value={name} onChangeText={setName} placeholder={t('followup.namePh')} />

        {/* 1. When it starts: one row, the choices in a sheet. */}
        <View style={{ gap: 10 }}>
          <SectionHeader title={t('followup.startTitle')} />
          <Group>
            <GroupRow
              last={trigger.kind === 'manual' || trigger.kind === 'created' || trigger.kind === 'visit'}
              icon={<TriggerIcon kind={trigger.kind} />}
              tint={colors.primary}
              title={startLabel}
              subtitle={t(`followup.startHint.${trigger.kind}`)}
              onPress={() => setStartOpen(true)}
            />
            <TriggerOptions
              trigger={trigger}
              setTrigger={setTrigger}
              statuses={options.statuses}
              services={services.data ?? []}
              servicesLoading={services.isLoading}
              dateFields={(options.fields.data ?? [])
                .filter((f) => isUserField(f.slug) && f.dataType === 'date')
                .map((f) => ({ key: f.slug, label: f.name ?? f.slug }))}
            />
          </Group>
        </View>

        {/* 2. The messages, as a timeline. */}
        <View style={{ gap: 10 }}>
          <SectionHeader title={t('followup.messagesTitle')} />
          {!api ? (
            <Text variant="caption" tone="muted" style={{ marginTop: -4 }}>
              {t('waTasks.stepHint')}
            </Text>
          ) : null}
          <View>
            {steps.map((st, i) => (
              <StepCard
                key={st.id}
                index={i}
                step={st}
                at={offsets[i]}
                last={i === steps.length - 1}
                templates={templates.data ?? []}
                loadingTemplates={templates.isLoading}
                api={api}
                onChange={(p) => patchStep(st.id, p)}
                onRemove={() => setSteps((prev) => prev.filter((s) => s.id !== st.id))}
              />
            ))}
          </View>
          <Pressable
            onPress={addStep}
            style={({ pressed }) => [styles.addStep, { borderColor: colors.borderStrong, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
          >
            <Plus size={16} color={colors.primary} />
            <Text variant="bodyStrong" tone="primary">
              {steps.length ? t('followup.addStep') : t('followup.addFirstStep')}
            </Text>
          </Pressable>
        </View>

        {/* 3. Everything else, out of the way until needed. */}
        <View style={{ gap: 12 }}>
          <Pressable onPress={() => setMoreOpen((v) => !v)} style={styles.moreToggle} accessibilityRole="button" accessibilityState={{ expanded: moreOpen }}>
            <Text variant="bodyStrong">{t('followup.moreOptions')}</Text>
            <ChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: moreOpen ? '180deg' : '0deg' }] }} />
          </Pressable>
          {moreOpen ? (
            <View style={{ gap: 18 }}>
              <Input label={t('followup.description')} value={description} onChangeText={setDescription} placeholder={t('followup.descriptionPh')} />
              {api && (channels.data?.length ?? 0) > 1 ? (
                <ChannelSelect
                  label={t('wa.sendFrom')}
                  channels={channels.data!}
                  value={channelId}
                  onChange={(id) => {
                    setChannelId(id);
                    // Templates belong to their channel: the steps' templates must be picked again.
                    if (id !== channelId)
                      setSteps((prev) =>
                        prev.map((s) =>
                          s.kind === 'session' ? s : { ...s, templateId: '', templateName: '', language: '', mapping: {}, headerMedia: undefined },
                        ),
                      );
                  }}
                />
              ) : null}
              <View style={{ gap: 8 }}>
                <Text variant="caption" tone="muted" style={{ fontWeight: '500' }}>
                  {t('followup.keepIf')}
                </Text>
                <Pressable onPress={() => setKeepOpen(true)} style={[styles.select, { borderColor: colors.borderStrong }]}>
                  <Filter size={16} color={colors.textMuted} />
                  <Text style={{ flex: 1 }}>
                    {countActiveFilters(keepIf) ? t('filter.active', { count: countActiveFilters(keepIf) }) : t('followup.always')}
                  </Text>
                  <ChevronDown size={16} color={colors.textMuted} />
                </Pressable>
                <ConditionSummary filter={keepIf} />
                <NarrowedNote filter={keepIf} />
                <Text variant="caption" tone="faint">
                  {t('followup.keepIfHint')}
                </Text>
                {countActiveFilters(keepIf) ? (
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <Chip small label={t('followup.onFail.cancel_series')} selected={onFail === 'cancel_series'} onPress={() => setOnFail('cancel_series')} />
                    <Chip small label={t('followup.onFail.skip')} selected={onFail === 'skip'} onPress={() => setOnFail('skip')} />
                  </Row>
                ) : null}
              </View>
              {trigger.kind === 'service' ? (
                <View style={{ gap: 8 }}>
                  <Text variant="caption" tone="muted" style={{ fontWeight: '500' }}>
                    {t('services.afterLast')}
                  </Text>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <Chip small label={t('services.stopAfterLast')} selected={!repeat} onPress={() => setRepeat(null)} />
                    <Chip
                      small
                      label={t('services.repeatAfterLast')}
                      selected={!!repeat}
                      onPress={() => setRepeat(repeat ?? { every: 2, unit: 'weeks', times: 2 })}
                    />
                  </Row>
                  {repeat ? (
                    <Row gap={6} style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                      <Text variant="caption">{t('services.every')}</Text>
                      <NumberBox value={repeat.every} min={1} max={365} onChange={(every) => setRepeat({ ...repeat, every })} />
                      {(['days', 'weeks', 'months'] as const).map((u) => (
                        <Chip key={u} small label={t(`followup.unit.${u}`)} selected={repeat.unit === u} onPress={() => setRepeat({ ...repeat, unit: u })} />
                      ))}
                      <Text variant="caption">{t('services.upTo')}</Text>
                      <NumberBox value={repeat.times} min={1} max={50} onChange={(times) => setRepeat({ ...repeat, times })} />
                      <Text variant="caption">{t('services.times')}</Text>
                    </Row>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      <StartSheet
        open={startOpen}
        onClose={() => setStartOpen(false)}
        trigger={trigger}
        visits={servicesOn}
        onPick={(next) => {
          setTrigger(next);
          setStartOpen(false);
        }}
        firstService={services.data?.[0]?.id ?? ''}
      />
      <FilterSheet
        open={keepOpen}
        value={keepIf}
        title={t('followup.keepIf')}
        onClose={() => setKeepOpen(false)}
        onApply={(f) => {
          const { search: _q, ...rest } = f;
          setKeepIf(rest);
          setKeepOpen(false);
        }}
      />
    </Screen>
  );
}

const TRIGGER_ICON: Record<SequenceTrigger['kind'], typeof Hand> = {
  manual: Hand,
  status: Sparkles,
  created: UserPlus,
  service: Wrench,
  visit: Store,
  milestone: Gift,
  occasion: CalendarHeart,
};

function TriggerIcon({ kind }: { kind: SequenceTrigger['kind'] }) {
  const Icon = TRIGGER_ICON[kind] ?? Repeat;
  return <Icon size={18} />;
}

/** A small number field (waits, repeats). */
function NumberBox({ value, onChange, min = 0, max = 999 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const { colors, radius } = useTheme();
  return (
    <TextInput
      value={String(value)}
      onChangeText={(v) => onChange(Math.max(min, Math.min(max, Number(v.replace(/\D/g, '')) || min)))}
      keyboardType="number-pad"
      selectTextOnFocus
      style={[styles.numBox, { color: colors.text, borderColor: colors.borderStrong, borderRadius: radius.sm }]}
    />
  );
}

/** What the chosen start rule needs (which status, which service, which visit, which date). */
function TriggerOptions({
  trigger,
  setTrigger,
  statuses,
  services,
  servicesLoading,
  dateFields,
}: {
  trigger: SequenceTrigger;
  setTrigger: (t: SequenceTrigger) => void;
  statuses: string[];
  services: { id: string; name: string }[];
  servicesLoading: boolean;
  dateFields: { key: string; label: string }[];
}) {
  const { t } = useTranslation();
  if (trigger.kind === 'status')
    return (
      <View style={styles.options}>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {statuses.map((s) => (
            <Chip
              key={s}
              small
              label={t(`status.${s}`, { defaultValue: s })}
              selected={trigger.status === s}
              onPress={() => setTrigger({ kind: 'status', status: s })}
            />
          ))}
        </Row>
      </View>
    );
  if (trigger.kind === 'service')
    return (
      <View style={styles.options}>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {services.map((s) => (
            <Chip key={s.id} small label={s.name} selected={trigger.serviceId === s.id} onPress={() => setTrigger({ kind: 'service', serviceId: s.id })} />
          ))}
        </Row>
        {!servicesLoading && !services.length ? (
          <Text variant="caption" tone="warning">
            {t('services.noneYet')}
          </Text>
        ) : null}
      </View>
    );
  if (trigger.kind === 'milestone')
    return (
      <View style={styles.options}>
        <Row gap={8} style={{ alignItems: 'center' }}>
          <Text variant="caption">{t('visits.trigger.onVisit')}</Text>
          <NumberBox value={trigger.visits} min={2} max={999} onChange={(visits) => setTrigger({ kind: 'milestone', visits })} />
        </Row>
      </View>
    );
  if (trigger.kind === 'occasion')
    return (
      <View style={styles.options}>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {[{ key: 'birthday', label: t('visits.field.birthday') }, { key: 'anniversary', label: t('visits.field.anniversary') }, ...dateFields].map((f) => (
            <Chip key={f.key} small label={f.label} selected={trigger.field === f.key} onPress={() => setTrigger({ ...trigger, field: f.key })} />
          ))}
        </Row>
        <Row gap={8} style={{ alignItems: 'center' }}>
          <NumberBox value={trigger.daysBefore} min={0} max={60} onChange={(daysBefore) => setTrigger({ ...trigger, daysBefore })} />
          <Text variant="caption">{t('visits.trigger.daysBefore')}</Text>
        </Row>
      </View>
    );
  return null;
}

/** Every way a series can start, each with one line on what it means. */
function StartSheet({
  open,
  onClose,
  trigger,
  onPick,
  visits,
  firstService,
}: {
  open: boolean;
  onClose: () => void;
  trigger: SequenceTrigger;
  onPick: (t: SequenceTrigger) => void;
  visits: boolean;
  firstService: string;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const groups: { title: string; items: { trigger: SequenceTrigger; title: string }[] }[] = [
    {
      title: t('followup.startGroup.contacts'),
      items: [
        { trigger: { kind: 'manual' }, title: t('followup.trigger.manual') },
        { trigger: { kind: 'created' }, title: t('followup.trigger.created') },
        { trigger: { kind: 'status', status: 'Won' }, title: t('followup.trigger.status') },
      ],
    },
    ...(visits
      ? [
          {
            title: t('visits.title'),
            items: [
              { trigger: { kind: 'visit' } as SequenceTrigger, title: t('visits.trigger.afterVisit') },
              { trigger: { kind: 'service', serviceId: firstService } as SequenceTrigger, title: t('services.trigger') },
              { trigger: { kind: 'milestone', visits: 5 } as SequenceTrigger, title: t('visits.trigger.milestone') },
              { trigger: { kind: 'occasion', field: 'birthday', daysBefore: 0 } as SequenceTrigger, title: t('visits.trigger.occasion') },
            ],
          },
        ]
      : []),
  ];
  return (
    <Sheet open={open} onClose={onClose} title={t('followup.startTitle')}>
      <View style={{ gap: 18 }}>
        {groups.map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            <SectionHeader title={g.title} />
            <View style={[styles.sheetList, { borderColor: colors.border, borderRadius: radius.md }]}>
              {g.items.map((it, i) => {
                const on = it.trigger.kind === trigger.kind;
                return (
                  <Pressable
                    key={it.trigger.kind}
                    onPress={() => onPick(on ? trigger : it.trigger)}
                    style={({ pressed }) => [
                      styles.sheetRow,
                      { backgroundColor: on ? colors.primarySoft : pressed ? colors.surfaceAlt : 'transparent' },
                      i < g.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={[styles.sheetIcon, { backgroundColor: on ? colors.primary : colors.surfaceAlt }]}>
                      {(() => {
                        const Icon = TRIGGER_ICON[it.trigger.kind];
                        return <Icon size={17} color={on ? '#fff' : colors.textMuted} />;
                      })()}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyStrong" style={on ? { color: colors.primary } : undefined}>
                        {it.title}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {t(`followup.startHint.${it.trigger.kind}`)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

function StepCard({
  index,
  step,
  at,
  last,
  templates,
  loadingTemplates,
  api,
  onChange,
  onRemove,
}: {
  index: number;
  step: SequenceStep;
  at: number;
  last: boolean;
  templates: Template[];
  loadingTemplates: boolean;
  api: boolean;
  onChange: (p: Partial<SequenceStep>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [conditionOpen, setConditionOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const template = templates.find((x) => x.id === step.templateId);
  const parsed = useMemo(() => (template ? parseTemplate(template.components) : null), [template]);
  const slots = useMemo(() => (parsed ? slotsOf(parsed) : []), [parsed]);
  const mediaFormat = parsed && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(parsed.header.format) ? (parsed.header.format as MediaFormat) : null;
  const conditions = step.onlyIf ? countActiveFilters(step.onlyIf) : 0;

  // Variables start empty: the user maps each one.
  const choose = (tpl: Template) => {
    onChange({ templateId: tpl.id, templateName: tpl.name, language: tpl.language, mapping: {}, headerMedia: undefined });
    setPicking(false);
  };

  const attach = async () => {
    if (!mediaFormat) return;
    const f = await pickForFormat(mediaFormat);
    if (!f) return;
    if (f.size && f.size > MAX_BYTES[mediaFormat])
      return showAlert(t('wa.tooLarge'), t('wa.tooLargeBody', { mb: Math.round(MAX_BYTES[mediaFormat] / 1048576) }));
    setUploading(true);
    try {
      onChange({ headerMedia: { format: mediaFormat, link: await uploadSendMedia(mediaFormat, f), filename: f.name } });
    } catch (err) {
      showAlert(t('wa.uploadFailed'), describeCrmError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.step}>
      {/* The rail: a numbered dot and a line down to the next message. */}
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: colors.primarySoft }]}>
          <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
            {index + 1}
          </Text>
        </View>
        {!last ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
      </View>

      <View style={{ flex: 1, gap: 10, paddingBottom: last ? 4 : 22 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={6} style={{ flexWrap: 'wrap', flex: 1 }}>
            <Text variant="bodyStrong">{index === 0 ? t('followup.waitFirst') : t('followup.wait')}</Text>
            <NumberBox value={step.wait.value} onChange={(value) => onChange({ wait: { ...step.wait, value } })} />
            <Pressable onPress={() => setUnitOpen(true)} style={[styles.unit, { borderColor: colors.borderStrong, borderRadius: radius.sm }]}>
              <Text>{t(`followup.unit.${step.wait.unit}`)}</Text>
              <ChevronDown size={14} color={colors.textMuted} />
            </Pressable>
          </Row>
          <Pressable onPress={() => setMenu(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('leads.moreActions')} style={styles.menuBtn}>
            <MoreHorizontal size={18} color={colors.textMuted} />
          </Pressable>
        </Row>
        <Text variant="caption" tone="faint" style={{ marginTop: -4 }}>
          {t('followup.sendsAt', { when: humanMinutes(at, t) })}
        </Text>

        {api ? (
          <SegmentedControl
            value={step.kind ?? 'template'}
            onChange={(kind) => onChange(kind === 'session' ? { kind, session: step.session ?? { type: 'text', text: '' } } : { kind })}
            options={[
              { value: 'template', label: t('wa.modeTemplate') },
              { value: 'session', label: t('wa.modeMessage') },
            ]}
          />
        ) : null}

        {step.kind === 'session' ? (
          <SessionComposer
            // The WhatsApp app sends text: a step that had media keeps just its words.
            value={
              !api && step.session && step.session.type !== 'text' ? { type: 'text', text: step.session.text } : (step.session ?? { type: 'text', text: '' })
            }
            onChange={(session) => onChange({ session })}
            bubble
            windowNote={api}
            textOnly={!api}
          />
        ) : (
          <>
            <Pressable onPress={() => setPicking(true)} style={[styles.select, { borderColor: colors.borderStrong }]}>
              <Text style={{ flex: 1 }} tone={template ? 'default' : 'muted'} numberOfLines={1}>
                {template?.name ?? (step.templateName || t('followup.pickTemplate'))}
              </Text>
              <ChevronRight size={16} color={colors.textMuted} style={rtlFlip()} />
            </Pressable>
            {parsed ? (
              <>
                <TemplatePreview template={parsed} mediaUri={step.headerMedia?.link} mediaName={step.headerMedia?.filename} />
                {mediaFormat ? (
                  <Pressable
                    onPress={() => void attach()}
                    style={[styles.drop, { borderColor: step.headerMedia ? colors.success : colors.borderStrong, borderRadius: radius.md }]}
                  >
                    {uploading ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Paperclip size={18} color={step.headerMedia ? colors.success : colors.primary} />
                    )}
                    <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                      {step.headerMedia?.filename ?? t('wa.pickMedia', { kind: t(`wa.headerType.${mediaFormat}`).toLowerCase() })}
                    </Text>
                  </Pressable>
                ) : null}
                <VariableMapper slots={slots} mapping={step.mapping} onChange={(mapping) => onChange({ mapping })} />
              </>
            ) : null}
          </>
        )}

        {conditions ? (
          <Pressable onPress={() => setConditionOpen(true)} style={[styles.condPill, { backgroundColor: colors.surfaceAlt }]}>
            <Filter size={13} color={colors.textMuted} />
            <Text variant="caption">{t('followup.stepCondition', { count: conditions })}</Text>
          </Pressable>
        ) : null}
        <NarrowedNote filter={step.onlyIf} />
      </View>

      {/* Wait unit */}
      <Sheet open={unitOpen} onClose={() => setUnitOpen(false)} title={t('followup.wait')}>
        <View style={[styles.sheetList, { borderColor: colors.border, borderRadius: radius.md }]}>
          {DELAY_UNITS.map((u, i) => (
            <Pressable
              key={u}
              onPress={() => {
                onChange({ wait: { ...step.wait, unit: u } });
                setUnitOpen(false);
              }}
              style={({ pressed }) => [
                styles.sheetRow,
                { backgroundColor: step.wait.unit === u ? colors.primarySoft : pressed ? colors.surfaceAlt : 'transparent' },
                i < DELAY_UNITS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
              ]}
            >
              <Text variant="bodyStrong" style={step.wait.unit === u ? { color: colors.primary } : undefined}>
                {t(`followup.unit.${u}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* Step menu: condition, delete. */}
      <Sheet open={menu} onClose={() => setMenu(false)} title={t('followup.stepN', { count: index + 1 })}>
        <Group>
          <GroupRow
            icon={<Filter size={18} />}
            tint={colors.primary}
            title={t('followup.addStepCondition')}
            subtitle={conditions ? t('followup.stepCondition', { count: conditions }) : undefined}
            onPress={() => {
              setMenu(false);
              setConditionOpen(true);
            }}
          />
          <GroupRow
            last
            danger
            icon={<Trash2 size={18} color={colors.danger} />}
            tint={colors.danger}
            title={t('followup.removeStep')}
            onPress={() => {
              setMenu(false);
              onRemove();
            }}
          />
        </Group>
      </Sheet>

      {picking ? (
        <Sheet open onClose={() => setPicking(false)} title={t('followup.pickTemplate')} subtitle={t('followup.approvedOnly')}>
          <View style={{ gap: 8 }}>
            {loadingTemplates ? <ActivityIndicator color={colors.primary} /> : null}
            {!loadingTemplates && !templates.length ? <Text tone="muted">{t('wa.noApproved')}</Text> : null}
            {templates.map((tpl) => (
              <Pressable
                key={tpl.id}
                onPress={() => choose(tpl)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderRadius: radius.md,
                    borderColor: tpl.id === step.templateId ? colors.primary : colors.border,
                    backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                  },
                ]}
              >
                <Text variant="bodyStrong">{tpl.name}</Text>
                <Text variant="caption" tone="muted" numberOfLines={2}>
                  {parseTemplate(tpl.components).body}
                </Text>
              </Pressable>
            ))}
          </View>
        </Sheet>
      ) : null}
      <FilterSheet
        open={conditionOpen}
        value={step.onlyIf ?? {}}
        title={t('followup.stepConditionTitle')}
        onClose={() => setConditionOpen(false)}
        onApply={(f) => {
          const { search: _q, ...rest } = f;
          onChange({ onlyIf: rest });
          setConditionOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  select: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 46, borderRadius: 10, borderWidth: 1 },
  numBox: { width: 56, height: 36, textAlign: 'center', fontSize: 15, fontWeight: '600', borderWidth: 1 },
  unit: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 10, borderWidth: 1 },
  drop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1.5, borderStyle: 'dashed' },
  option: { padding: 12, borderWidth: 1, gap: 2 },
  options: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 28 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, marginTop: 4, borderRadius: 1 },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  condPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  addStep: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  moreToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  sheetList: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  sheetIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});

/** Members whose role doesn't include it get a "not allowed" page (see `P.app`). */
export default function EditSequenceRoute() {
  // One form per account: a switch while it's open starts it fresh, never saving into the other account.
  const acct = useAccountsStore((s) => s.activeId);
  return (
    <RequireCan all={[P.app.series]}>
      <EditSequence key={acct ?? 'none'} />
    </RequireCan>
  );
}
