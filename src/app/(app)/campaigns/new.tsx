/**
 * New WhatsApp campaign.
 *
 * 1. Name, channel and an approved template; each variable maps to a lead
 *    field, a file column or fixed text (header media from the phone).
 * 2. Audience: CRM leads (all or filtered / a segment, or the ones picked on
 *    the leads list), pasted numbers, a CSV or Excel file, or a re-target of
 *    an earlier campaign.
 * 3. Send now, schedule (optionally repeating) or keep it as a draft.
 * A test send to one lead (picked by search) delivers the real message, with
 * that lead's values, before anything goes out; the preview shows it too.
 */
import type { Template } from '@ab-ecosystem/cpaas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, ClipboardList, FileSpreadsheet, Filter, FlaskConical, History, Paperclip, Send, UserCheck, UserRound, Users, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { LeadPickerSheet } from '@/components/campaigns/LeadPickerSheet';
import { campaignKeys } from '@/components/campaigns/shared';
import { FilterSheet } from '@/components/leads/FilterSheet';
import { Button, Card, Chip, Columns, EmptyState, Input, Row, Screen, Stack, Text } from '@/components/ui';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { ChannelSelect } from '@/components/whatsapp/ChannelSelect';
import { TemplatePicker } from '@/components/whatsapp/TemplatePicker';
import { TemplatePreview } from '@/components/whatsapp/TemplatePreview';
import { useVariableFields, VariableMapper } from '@/components/whatsapp/VariableMapper';
import { useFields, useSegments, useTemplates, useWaChannels } from '@/hooks/queries';
import { confirmAction, showAlert } from '@/lib/dialog';
import { buildContactFilter, countActiveFilters, type LeadFilter } from '@/lib/filters';
import { F } from '@/services/crm/schema';
import { MAX_BYTES, pickForFormat } from '@/lib/pickFile';
import { formatPhone } from '@/lib/phone';
import { useDesktop } from '@/hooks/useDesktop';
import { useNow } from '@/hooks/useNow';
import { isOverdue } from '@/lib/time';
import {
  columnKey,
  countLeads,
  createCampaignDraft,
  getCampaign,
  invalidNumbers,
  isWebhookUnset,
  listCampaigns,
  mappingComplete,
  MAX_LEADS,
  previewAudience,
  sendTest,
  triggerCampaign,
  fileRow,
  valuesFor,
  needsColumns,
  needsFixedValues,
  type CampaignAudience,
  type CampaignDraft,
  type RetargetGroup,
} from '@/services/crm/campaigns';
import { describeCrmError } from '@/services/crm/client';
import type { Lead } from '@/services/crm/leads';
import { parseSheetFile } from '@/services/crm/importLeads';
import { senderContext } from '@/services/crm/sequences';
import { FIELD_TOKEN, parseTemplate, reusableHeaderUrl, slotsOf, uploadSendMedia, type MediaFormat, type PickedFile } from '@/services/crm/whatsapp';
import { useWhatsAppConfig, type VariableSource } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';

type AudienceKind = CampaignAudience['kind'];
type SheetData = { fileName: string; headers: string[]; rows: Record<string, string>[] };
type When = 'now' | 'later' | 'draft';
type RepeatKey = 'off' | 'days' | 'weeks' | 'months';

const AUDIENCES: AudienceKind[] = ['numbers', 'file', 'leads', 'retarget'];

const parseFilter = (raw?: string): LeadFilter => {
  try {
    return raw ? (JSON.parse(raw) as LeadFilter) : {};
  } catch {
    return {};
  }
};
const GROUPS: RetargetGroup[] = ['failed', 'unread', 'noReply', 'replied', 'all'];
const REPEATS: RepeatKey[] = ['off', 'days', 'weeks', 'months'];
const AUDIENCE_ICON = { numbers: ClipboardList, file: FileSpreadsheet, leads: Users, retarget: History, selected: UserCheck } as const;

/** Schedule shortcuts: in an hour, tomorrow 10:00, next Monday 10:00. */
const QUICK = {
  hour: () => new Date(Date.now() + 3600_000),
  tomorrow: () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d;
  },
  monday: () => {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    d.setHours(10, 0, 0, 0);
    return d;
  },
} as const;

/** The mapping without anything that reads a file column (the file changed, or the audience is no longer a file). */
const readsColumn = (v: VariableSource) => (v.kind === 'field' ? /^col_\d+$/.test(v.key) : /\[\[\s*col_\d+\s*\]\]/.test(v.value));
const withoutColumns = (m: Record<string, VariableSource>) => Object.fromEntries(Object.entries(m).filter(([, v]) => !readsColumn(v)));

function NewCampaign() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ retarget?: string; group?: RetargetGroup; name?: string; filter?: string; leadIds?: string }>();
  const selectedIds = useMemo(() => (params.leadIds ? params.leadIds.split(',').filter(Boolean) : []), [params.leadIds]);
  const config = useWhatsAppConfig();
  const channels = useWaChannels();
  const segments = useSegments();
  const leadFields = useVariableFields();
  const ctx = useMemo(() => senderContext(), []);

  const [name, setName] = useState(params.name ?? '');
  const [channelId, setChannelId] = useState<string | null>(config.channelId);
  const channel = channelId ?? channels.data?.[0]?.id ?? null;
  const [template, setTemplate] = useState<Template | null>(null);
  const [mapping, setMapping] = useState<Record<string, VariableSource>>({});
  const [media, setMedia] = useState<PickedFile | null>(null);

  // Starts on pasted numbers: opening on "all leads" made a whole-list send one tap away.
  // A filter passed in (from Contacts) still opens on leads.
  const [kind, setKind] = useState<AudienceKind>(selectedIds.length ? 'selected' : params.retarget ? 'retarget' : params.filter ? 'leads' : 'numbers');
  const [filter, setFilter] = useState<LeadFilter>(() => parseFilter(params.filter));
  const [filterOpen, setFilterOpen] = useState(false);
  const [numbers, setNumbers] = useState('');
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [column, setColumn] = useState('');
  const [retargetId, setRetargetId] = useState(params.retarget ?? '');
  const [group, setGroup] = useState<RetargetGroup>(params.group ?? 'failed');

  const [when, setWhen] = useState<When>('now');
  const [at, setAt] = useState(() => new Date(Date.now() + 3600_000));
  const [repeat, setRepeat] = useState<RepeatKey>('off');
  const [testLead, setTestLead] = useState<Lead | null>(null);
  const [pickingTest, setPickingTest] = useState(false);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // After a tap on the button with something missing: each problem shows where it is.
  const [tried, setTried] = useState(false);
  const now = useNow(30_000);
  const desktop = useDesktop();
  const uploaded = useRef<{ uri: string; link: string } | null>(null);

  const parsed = useMemo(() => (template ? parseTemplate(template.components) : null), [template]);
  const slots = useMemo(() => (parsed ? slotsOf(parsed) : []), [parsed]);
  const mediaFormat = parsed && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(parsed.header.format) ? (parsed.header.format as MediaFormat) : null;
  const columns = useMemo(() => (kind === 'file' && sheet ? sheet.headers.map((h, i) => ({ key: columnKey(i), label: h })) : []), [kind, sheet]);
  const labelOf = (k: string) => columns.find((c) => c.key === k)?.label ?? leadFields.find((f) => f.key === k)?.label ?? k;

  // A filter with too many choices to combine is narrowed to each field's first value: the campaign would
  // silently reach fewer people than picked, so it is said here and in the confirm.
  const allFields = useFields();
  const fieldName = (slug: string) =>
    slug === F.status
      ? t('common.status')
      : slug === F.contactType
        ? t('leads.contactType')
        : slug === F.assignedName
          ? t('filter.assignedTo')
          : (allFields.data?.find((f) => f.slug === slug)?.name ?? slug);
  const collapsed = useMemo(() => (kind === 'leads' ? buildContactFilter(filter).collapsed : []), [kind, filter]);
  const narrowed = collapsed.length
    ? t('filter.narrowed', {
        defaultValue: 'Too many choices to combine: only the first {{fields}} picked is used. Pick fewer to see everything.',
        fields: collapsed.map(fieldName).join(', '),
      })
    : '';
  const leadCount = useQuery({ queryKey: ['campaigns', 'count', filter], queryFn: () => countLeads(filter), enabled: kind === 'leads' });
  const past = useQuery({ queryKey: ['campaigns', 'retargetable'], queryFn: () => listCampaigns({ status: 'completed' }), enabled: kind === 'retarget' });

  const audience: CampaignAudience | null =
    kind === 'leads'
      ? { kind, filter }
      : kind === 'selected'
        ? { kind, ids: selectedIds }
        : kind === 'numbers'
          ? numbers.trim()
            ? { kind, text: numbers }
            : null
          : kind === 'file'
            ? sheet && column
              ? { kind, ...sheet, column }
              : null
            : retargetId
              ? { kind, campaignId: retargetId, group }
              : null;
  const preview = audience ? previewAudience(audience) : null;
  const count = kind === 'leads' ? leadCount.data : kind === 'selected' ? selectedIds.length : preview?.receivers;
  const sampleRow = kind === 'file' && sheet?.rows[0] ? fileRow(sheet.headers, sheet.rows[0]) : null;
  // With a test lead picked, the preview shows exactly what that lead gets.
  const testValues = template && testLead ? valuesFor(template, mapping, testLead, sampleRow, ctx) : null;

  // Every variable starts empty: the sender maps each one themselves (no guessed fields).
  const pickTemplate = (tpl: Template) => {
    setTemplate(tpl);
    setMapping({});
    setMedia(null);
    if (!name.trim()) setName(`${tpl.name} · ${new Date().toLocaleDateString()}`);
  };

  // A re-target starts from the original campaign's channel and template; any other can be picked.
  const source = useQuery({ queryKey: campaignKeys.one(params.retarget ?? ''), queryFn: () => getCampaign(params.retarget!), enabled: !!params.retarget });
  const sourceMsg = source.data?.messages[0];
  const sourceTpl = (sourceMsg?.message as { template?: { name?: string; language?: { code?: string } } } | undefined)?.template;
  const sourceChannel = sourceMsg?.channel.id;
  const approved = useTemplates(channel, 'approved');
  // Done once; the user picking a channel or template themselves also ends it (nothing snaps back).
  const [prefilled, setPrefilled] = useState(!params.retarget);
  const [channelMoved, setChannelMoved] = useState(false);
  if (!prefilled && source.isError) setPrefilled(true);
  else if (!prefilled && source.data && channels.data) {
    if (!channelMoved && sourceChannel && channel !== sourceChannel && channels.data.some((c) => c.id === sourceChannel)) {
      setChannelMoved(true);
      setChannelId(sourceChannel);
    } else if (!sourceTpl?.name || channel !== sourceChannel || approved.isError) setPrefilled(true);
    else if (approved.data) {
      setPrefilled(true);
      const match = approved.data.find((x) => x.name === sourceTpl.name && (!sourceTpl.language?.code || x.language === sourceTpl.language.code));
      if (match) pickTemplate(match);
    }
  }

  /** What a slot shows in the preview: fixed text as-is, per-recipient values as `{Field}`. */
  const shown = (key: string) => {
    if (testValues) return testValues[key] || undefined;
    const m = mapping[key];
    if (!m) return undefined;
    return m.kind === 'field' ? `{${labelOf(m.key)}}` : m.value.replace(FIELD_TOKEN, (_: string, k: string) => `{${labelOf(k)}}`);
  };

  const pickMedia = async () => {
    if (!mediaFormat) return;
    const f = await pickForFormat(mediaFormat);
    if (!f) return;
    if (f.size && f.size > MAX_BYTES[mediaFormat])
      return showAlert(t('wa.tooLarge'), t('wa.tooLargeBody', { mb: Math.round(MAX_BYTES[mediaFormat] / 1048576) }));
    setMedia(f);
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'text/csv',
        'text/comma-separated-values',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
      ],
      copyToCacheDirectory: true,
    });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    try {
      const s = await parseSheetFile(a.uri, a.name, a.mimeType);
      if (!s.rows.length) return showAlert(t('import.emptyFile'), t('import.noRows'));
      setSheet({ fileName: s.fileName, headers: s.headers, rows: s.rows });
      setMapping(withoutColumns);
      setColumn(s.headers.find((h) => /phone|mobile|number|whatsapp|contact/i.test(h)) ?? s.headers[0] ?? '');
    } catch (err) {
      showAlert(t('camp.fileFailed'), describeCrmError(err));
    }
  };

  // A test send leaves the audience out; the picked media is uploaded once.
  const draftOf = async (forTest = false): Promise<CampaignDraft | null> => {
    if (!channel || !template || (!audience && !forTest)) return null;
    let link = mediaFormat && parsed ? reusableHeaderUrl(parsed) : undefined;
    if (mediaFormat && media) {
      link = uploaded.current?.uri === media.uri ? uploaded.current.link : await uploadSendMedia(mediaFormat, media);
      uploaded.current = { uri: media.uri, link };
    }
    return {
      name: name.trim() || template.name,
      channelId: channel,
      template,
      mapping,
      headerMedia: mediaFormat && link ? { format: mediaFormat, link, filename: media?.name } : undefined,
      audience: audience ?? { kind: 'numbers', text: '' },
      repeat: when === 'later' && repeat !== 'off' ? { every: 1, unit: repeat } : undefined,
    };
  };

  // What still stops the send, by the section it belongs to.
  const issues: Partial<Record<'template' | 'vars' | 'media' | 'audience' | 'when', string>> = {};
  const varsIncomplete = !!template && !mappingComplete(template, mapping);
  if (!template) issues.template = t('camp.needTemplate');
  else {
    if (varsIncomplete) issues.vars = t('wa.fillVariables');
    else if (audience && needsFixedValues({ template, mapping, audience })) issues.vars = t('camp.numbersNeedFixed');
    else if (audience && needsColumns({ template, mapping, audience })) issues.vars = t('camp.fileNeedsColumns');
    if (mediaFormat && !media && !(parsed && reusableHeaderUrl(parsed))) issues.media = t('wa.needMedia');
  }
  if (!audience) issues.audience = t('camp.needAudience');
  else if (kind !== 'retarget' && count === 0) issues.audience = t('camp.noRecipients');
  if (when === 'later' && at.getTime() - 60_000 < now) issues.when = t('camp.pastTime');
  const problem = issues.template ?? issues.vars ?? issues.media ?? issues.audience ?? issues.when ?? null;
  const messageDone = !issues.template && !issues.vars && !issues.media;
  const invalid = kind === 'numbers' ? invalidNumbers(numbers) : [];
  const fmtAt = at.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const cta =
    when === 'draft'
      ? t('camp.saveDraft')
      : when === 'later'
        ? t('camp.ctaSchedule', { when: fmtAt })
        : kind !== 'retarget' && count
          ? t('camp.ctaSend', { who: t('camp.recipients', { count }) })
          : t('camp.sendNow');

  const test = async () => {
    // The test lead has their own details, so "pasted numbers need fixed text" doesn't apply here.
    const p = issues.template ?? (varsIncomplete ? issues.vars : undefined) ?? issues.media;
    if (p) return showAlert(p);
    if (!testLead) return setPickingTest(true);
    setTesting(true);
    try {
      const d = await draftOf(true);
      if (d) await sendTest(d, testLead, ctx, sampleRow);
      showAlert(t('camp.testSent'), t('camp.testSentBody', { name: testLead.name || formatPhone(testLead.phone) }));
    } catch (err) {
      showAlert(t('camp.testFailed'), describeCrmError(err));
    } finally {
      setTesting(false);
    }
  };

  // One at a time: a double tap queued two confirm dialogs and created the campaign twice.
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await submitOnce();
    } finally {
      submitting.current = false;
    }
  };

  const submitOnce = async () => {
    if (problem) return setTried(true);
    // `now` ticks every 30 s; the time may have passed since.
    if (when === 'later' && isOverdue(new Date(at.getTime() - 60_000))) return showAlert(t('camp.pastTime'));
    // A lead count still loading (or that failed) is left out rather than shown as 0.
    const recipients =
      kind === 'retarget' ? t('camp.retargetCount', { group: t(`camp.group.${group}`) }) : count != null ? t('camp.recipients', { count }) : '';
    const ok = await confirmAction({
      title: when === 'draft' ? t('camp.confirmDraft') : when === 'later' ? t('camp.confirmSchedule') : t('camp.confirmSend'),
      message: [
        narrowed,
        [recipients, when === 'later' ? at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''].filter(Boolean).join(' · '),
        // The count includes leads with no number, and the build stops at MAX_LEADS: say so before, not after.
        kind === 'leads' || kind === 'selected'
          ? t('camp.leadsCapNote', {
              max: MAX_LEADS.toLocaleString(),
              defaultValue: 'Leads without a WhatsApp number are skipped, and one campaign goes to at most {{max}} leads.',
            })
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      confirmText: when === 'draft' ? t('camp.saveDraft') : when === 'later' ? t('camp.schedule') : t('camp.sendNow'),
      cancelText: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(t('camp.preparing'));
    try {
      const d = await draftOf();
      if (!d) return;
      const res = await createCampaignDraft(d, ctx, (n) => setBusy(t('camp.loadingLeads', { count: n })));
      let warn: string | null = null;
      if (when !== 'draft') {
        setBusy(t('camp.arming'));
        try {
          await triggerCampaign(res.campaign.id, when === 'later' ? at : undefined);
        } catch (err) {
          warn = isWebhookUnset(err) ? t('camp.webhookUnset') : describeCrmError(err);
        }
      }
      void qc.invalidateQueries({ queryKey: campaignKeys.all });
      const extra =
        (res.skipped || res.duplicates ? `\n${t('camp.dropped', { skipped: res.skipped, duplicates: res.duplicates })}` : '') +
        (res.incomplete ? `\n${t('camp.incomplete', { count: res.incomplete })}` : '');
      if (warn) showAlert(t('camp.savedNotSent'), warn + extra);
      else
        showAlert(
          when === 'draft' ? t('camp.draftSaved') : when === 'later' ? t('camp.scheduled') : t('camp.sending'),
          (res.receivers ? t('camp.recipients', { count: res.receivers }) : '') + extra,
        );
      // Creating from a large audience can take minutes: only move on if the user is still here.
      if (mounted.current) router.replace({ pathname: '/(app)/campaigns/[id]', params: { id: res.campaign.id } });
    } catch (err) {
      const code = (err as Error)?.message;
      showAlert(
        t('camp.createFailed'),
        code === 'noRecipients'
          ? t('camp.noRecipients')
          : code === 'allIncomplete'
            ? t('camp.allIncomplete')
            : code === 'numbersNeedFixed'
              ? t('camp.numbersNeedFixed')
              : code === 'fileNeedsColumns'
                ? t('camp.fileNeedsColumns')
                : describeCrmError(err),
      );
    } finally {
      setBusy(null);
    }
  };

  if (config.mode !== 'api' || (!channels.isLoading && !channel)) {
    return (
      <Screen title={t('camp.new')} back>
        <EmptyState
          icon={<Send size={26} color="#fff" />}
          title={t('camp.needApi')}
          body={t('camp.needApiBody')}
          action={t('whatsapp.settings')}
          onAction={() => router.replace('/(app)/settings/whatsapp')}
        />
      </Screen>
    );
  }

  const issue = (text?: string) =>
    tried && text ? (
      <Text variant="caption" tone="danger">
        {text}
      </Text>
    ) : null;

  return (
    <Screen
      title={t('camp.new')}
      back
      scroll
      maxWidth={1180}
      footer={
        problem && !busy ? (
          // Says what is still missing; a tap points at it in place.
          <Button variant="secondary" title={problem} onPress={() => setTried(true)} />
        ) : (
          <Button title={busy ?? cta} icon={<Send size={18} color="#fff" />} loading={!!busy} disabled={!!busy} onPress={() => void submit()} />
        )
      }
    >
      <Columns widths={[undefined, desktop ? 400 : undefined]} columnStyles={[undefined, stickyStyle]} style={{ marginTop: 8, paddingBottom: 24 }}>
        <Stack>
          <Step n={1} title={t('camp.message')} done={messageDone}>
            <Input label={t('camp.name')} value={name} onChangeText={setName} placeholder={t('camp.namePh')} />
            {(channels.data?.length ?? 0) > 1 ? (
              <ChannelSelect
                label={t('wa.sendFrom')}
                channels={channels.data!}
                value={channel}
                onChange={(id) => {
                  setPrefilled(true);
                  setChannelId(id);
                  setTemplate(null);
                  setMapping({});
                }}
              />
            ) : null}
            <TemplatePicker label={t('camp.template')} channelId={channel} value={template?.id ?? ''} onPick={(tpl) => {
                setPrefilled(true);
                pickTemplate(tpl);
              }}
            />
            {issue(issues.template)}
            {params.retarget ? (
              <Text variant="caption" tone="muted">
                {t('camp.retargetMsgHint')}
              </Text>
            ) : null}
            {mediaFormat ? (
              <View style={{ gap: 8 }}>
                <Text variant="bodyStrong">{t('wa.headerMedia')}</Text>
                <Pressable
                  onPress={() => void pickMedia()}
                  style={[
                    styles.drop,
                    { borderColor: media ? colors.success : tried && issues.media ? colors.danger : colors.borderStrong, borderRadius: radius.md },
                  ]}
                >
                  <Paperclip size={20} color={media ? colors.success : colors.primary} />
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                    {media ? media.name : t('wa.pickMedia', { kind: t(`wa.headerType.${mediaFormat}`).toLowerCase() })}
                  </Text>
                </Pressable>
                {issue(issues.media)}
              </View>
            ) : null}
            {slots.length ? (
              <View style={{ gap: 8 }}>
                <Text variant="bodyStrong">{t('wa.variables')}</Text>
                <Text variant="caption" tone="muted">
                  {kind === 'file' ? t('camp.varsFile') : kind === 'leads' || kind === 'selected' ? t('camp.varsLeads') : t('camp.varsFixed')}
                </Text>
                <VariableMapper slots={slots} mapping={mapping} onChange={setMapping} extraFields={columns} />
                {issue(issues.vars)}
              </View>
            ) : null}
          </Step>

          <Step n={2} title={t('camp.audience')} done={!issues.audience}>
            <View style={styles.tiles}>
              {(selectedIds.length ? (['selected', ...AUDIENCES] as AudienceKind[]) : AUDIENCES).map((a) => {
                const Icon = AUDIENCE_ICON[a];
                const on = kind === a;
                return (
                  <Pressable
                    key={a}
                    onPress={() => {
                      setKind(a);
                      // Variables mapped to columns of a file would be empty for everyone.
                      if (a !== 'file') setMapping(withoutColumns);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[
                      styles.tile,
                      { borderRadius: radius.md, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface },
                    ]}
                  >
                    <Icon size={20} color={on ? colors.primary : colors.textMuted} />
                    <Text variant="bodyStrong" numberOfLines={1} style={on ? { color: colors.primary } : undefined}>
                      {t(`camp.aud.${a}`)}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={2}>
                      {t(`camp.audDesc.${a}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {kind === 'selected' ? (
              <Text tone="primary" variant="bodyStrong">
                {t('camp.recipients', { count: selectedIds.length })}
              </Text>
            ) : null}

            {kind === 'leads' ? (
              <View style={{ gap: 8 }}>
                <Pressable
                  onPress={() => setFilterOpen(true)}
                  style={[styles.drop, { borderColor: colors.border, borderRadius: radius.md, borderStyle: 'solid' }]}
                >
                  <Filter size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">
                      {filter.segment
                        ? (segments.data?.find((s) => s.id === filter.segment)?.name ?? filter.segment)
                        : countActiveFilters(filter)
                          ? t('filter.active', { count: countActiveFilters(filter) })
                          : t('camp.allLeads')}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {t('camp.filterHint')}
                    </Text>
                  </View>
                </Pressable>
                {narrowed ? (
                  <Text variant="caption" tone="warning">
                    {narrowed}
                  </Text>
                ) : null}
                {leadCount.isFetching ? <ActivityIndicator color={colors.primary} /> : null}
                {count != null && !leadCount.isFetching ? (
                  <Text tone="primary" variant="bodyStrong">
                    {t('camp.recipients', { count })}
                  </Text>
                ) : null}
                <Text variant="caption" tone="faint">
                  {t('camp.leadsNote')}
                </Text>
              </View>
            ) : null}

            {kind === 'numbers' ? (
              <View style={{ gap: 8 }}>
                <Input
                  value={numbers}
                  onChangeText={setNumbers}
                  placeholder={t('camp.numbersPh')}
                  multiline
                  style={{ minHeight: 110, textAlignVertical: 'top' }}
                  keyboardType="phone-pad"
                />
                {preview && numbers.trim() ? (
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <Pill text={t('camp.valid', { count: preview.receivers })} fg={colors.success} bg={colors.successSoft} />
                    {preview.skipped ? <Pill text={t('camp.invalid', { count: preview.skipped })} fg={colors.danger} bg={colors.dangerSoft} /> : null}
                    {preview.duplicates ? (
                      <Pill text={t('camp.duplicates', { count: preview.duplicates })} fg={colors.textMuted} bg={colors.surfaceAlt} />
                    ) : null}
                  </Row>
                ) : null}
                {invalid.length ? (
                  <Text variant="caption" tone="danger" numberOfLines={2}>
                    {t('camp.notNumbers', { list: invalid.slice(0, 5).join(', ') + (invalid.length > 5 ? '…' : '') })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {kind === 'file' ? (
              <View style={{ gap: 10 }}>
                <Pressable
                  onPress={() => void pickFile()}
                  style={[styles.drop, { borderColor: sheet ? colors.success : colors.borderStrong, borderRadius: radius.md }]}
                >
                  <FileSpreadsheet size={20} color={sheet ? colors.success : colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {sheet ? sheet.fileName : t('camp.pickFile')}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {sheet ? t('camp.fileRows', { count: sheet.rows.length, cols: sheet.headers.length }) : t('camp.fileHint')}
                    </Text>
                  </View>
                </Pressable>
                {sheet ? (
                  <>
                    <Text variant="caption" tone="muted">
                      {t('camp.numberColumn')}
                    </Text>
                    <Row gap={6} style={{ flexWrap: 'wrap' }}>
                      {sheet.headers.map((h) => (
                        <Chip key={h} small label={h} selected={column === h} onPress={() => setColumn(h)} />
                      ))}
                    </Row>
                    {preview ? (
                      <Row gap={6} style={{ flexWrap: 'wrap' }}>
                        <Pill text={t('camp.valid', { count: preview.receivers })} fg={colors.success} bg={colors.successSoft} />
                        {preview.skipped ? <Pill text={t('camp.invalid', { count: preview.skipped })} fg={colors.danger} bg={colors.dangerSoft} /> : null}
                        {preview.duplicates ? (
                          <Pill text={t('camp.duplicates', { count: preview.duplicates })} fg={colors.textMuted} bg={colors.surfaceAlt} />
                        ) : null}
                      </Row>
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : null}

            {kind === 'retarget' ? (
              <View style={{ gap: 10 }}>
                <Text variant="caption" tone="muted">
                  {t('camp.retargetFrom')}
                </Text>
                {past.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
                {!past.isLoading && !past.data?.data.length ? (
                  <Text variant="caption" tone="faint">
                    {t('camp.noPast')}
                  </Text>
                ) : null}
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {(past.data?.data ?? []).map((c) => (
                    <Chip key={c.id} small label={c.name} selected={retargetId === c.id} onPress={() => setRetargetId(c.id)} />
                  ))}
                  {retargetId && !past.data?.data.some((c) => c.id === retargetId) ? (
                    <Chip small label={t('camp.thisCampaign')} selected onPress={() => {}} />
                  ) : null}
                </Row>
                <Text variant="caption" tone="muted">
                  {t('camp.sendTo')}
                </Text>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {GROUPS.map((g) => (
                    <Chip key={g} small label={t(`camp.group.${g}`)} selected={group === g} onPress={() => setGroup(g)} />
                  ))}
                </Row>
              </View>
            ) : null}
            {issue(issues.audience)}
          </Step>

          <Step n={3} title={t('wa.when')} done={!issues.when}>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {(['now', 'later', 'draft'] as When[]).map((w) => (
                <Chip key={w} label={t(`camp.when.${w}`)} selected={when === w} onPress={() => setWhen(w)} />
              ))}
            </Row>
            {when === 'now' ? (
              <Text variant="caption" tone="muted">
                {t('camp.nowHint')}
              </Text>
            ) : null}
            {when === 'later' ? (
              <View style={{ gap: 10 }}>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {(Object.keys(QUICK) as (keyof typeof QUICK)[]).map((k) => (
                    <Chip key={k} small label={t(`camp.quick.${k}`)} onPress={() => setAt(QUICK[k]())} />
                  ))}
                </Row>
                <DateTimeField label={fmtAt} value={at} onChange={setAt} minimumDate={new Date(now)} selected />
                {issue(issues.when)}
                <Text variant="caption" tone="muted">
                  {t('camp.repeat')}
                </Text>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {REPEATS.map((r) => (
                    <Chip key={r} small label={t(`camp.rep.${r}`)} selected={repeat === r} onPress={() => setRepeat(r)} />
                  ))}
                </Row>
              </View>
            ) : null}
            {when === 'draft' ? (
              <Text variant="caption" tone="muted">
                {t('camp.draftHint')}
              </Text>
            ) : null}
          </Step>
        </Stack>

        {/* Desktop: a column of its own that stays in view while the steps scroll. */}
        <Stack>
          {parsed ? (
            // Exactly what goes out, and a test to one contact (last on phones, right above the button).
            <Card style={{ gap: 12 }}>
              <Text variant="h3">{t('camp.preview')}</Text>
              <TemplatePreview
                template={parsed}
                values={(n) => shown(`body:${n}`)}
                headerValues={(n) => shown(`header:${n}`)}
                mediaUri={media?.uri}
                mediaName={media?.name}
              />
              <Row gap={8}>
                <FlaskConical size={16} color={colors.textMuted} />
                <Text variant="bodyStrong">{t('camp.test')}</Text>
              </Row>
              <Text variant="caption" tone="muted">
                {t('camp.testHint')}
              </Text>
              <Pressable
                onPress={() => setPickingTest(true)}
                style={[styles.drop, { borderColor: testLead ? colors.success : colors.border, borderRadius: radius.md, borderStyle: 'solid' }]}
              >
                <UserRound size={18} color={testLead ? colors.success : colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {testLead ? testLead.name || formatPhone(testLead.phone) : t('camp.pickTestLead')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {testLead ? `${formatPhone(testLead.phone)} · ${t('camp.previewFor')}` : t('camp.pickTestLeadHint')}
                  </Text>
                </View>
                {testLead ? (
                  <Pressable onPress={() => setTestLead(null)} hitSlop={10}>
                    <X size={16} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </Pressable>
              <Button variant="secondary" size="sm" title={t('camp.sendTest')} disabled={!testLead} loading={testing} onPress={() => void test()} />
            </Card>
          ) : desktop ? (
            <Card style={{ gap: 8 }}>
              <Text variant="h3">{t('camp.preview')}</Text>
              <Text tone="muted">{t('camp.needTemplate')}</Text>
            </Card>
          ) : null}
        </Stack>
      </Columns>

      {pickingTest ? (
        <LeadPickerSheet
          title={t('camp.pickTestLead')}
          onClose={() => setPickingTest(false)}
          onPick={(l) => {
            setTestLead(l);
            setPickingTest(false);
          }}
        />
      ) : null}
      <FilterSheet
        open={filterOpen}
        value={filter}
        title={t('camp.audience')}
        onClose={() => setFilterOpen(false)}
        onApply={(f) => {
          setFilter(f);
          setFilterOpen(false);
        }}
      />
    </Screen>
  );
}

/** Web only: CSS sticky keeps the preview column in view inside the scrolling page. */
const stickyStyle = { position: 'sticky', top: 8 } as unknown as ViewStyle;

/** A numbered section; the number turns into a tick once the section is complete. */
function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Card style={{ gap: 12 }}>
      <Row gap={10}>
        <View style={[styles.num, { backgroundColor: done ? colors.success : colors.primarySoft }]}>
          {done ? (
            <Check size={14} color="#fff" strokeWidth={3} />
          ) : (
            <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
              {n}
            </Text>
          )}
        </View>
        <Text variant="h3">{title}</Text>
      </Row>
      {children}
    </Card>
  );
}

function Pill({ text, fg, bg }: { text: string; fg: string; bg: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: bg }}>
      <Text variant="caption" style={{ color: fg, fontWeight: '600' }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  drop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderStyle: 'dashed' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexBasis: '47%', flexGrow: 1, padding: 12, gap: 4, borderWidth: 1.5 },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});

/** Members whose role can't open this page get a short explanation instead. */
export default function NewCampaignGate() {
  return (
    <RequireCan any={[P.campaigns.create]}>
      <NewCampaign />
    </RequireCan>
  );
}
