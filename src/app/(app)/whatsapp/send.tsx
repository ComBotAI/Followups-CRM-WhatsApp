/**
 * Send a WhatsApp template to a lead through the API channel.
 *
 * 1. Pick an approved template.
 * 2. Each variable is mapped to a lead field (remembered per template) or
 *    fixed text; the preview shows exactly what this lead will receive.
 * 3. A media header takes a photo, video or document from the phone.
 * 4. Send now, or schedule it (it then shows on the lead's scheduled list).
 */
import type { Template } from '@ab-ecosystem/cpaas';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { CalendarClock, ChevronLeft, FileText, Paperclip, Search, Send } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { TemplatePreview } from '@/components/whatsapp/TemplatePreview';
import { VariableMapper } from '@/components/whatsapp/VariableMapper';
import { ChannelSelect } from '@/components/whatsapp/ChannelSelect';
import { SessionComposer, isSessionReady } from '@/components/whatsapp/SessionComposer';
import { Button, Card, Chip, EmptyState, Row, Screen, SearchField, SegmentedControl, Text } from '@/components/ui';
import { useLead, useTemplates, useWaChannels, waKeys } from '@/hooks/queries';
import { showAlert } from '@/lib/dialog';
import { MAX_BYTES, pickForFormat } from '@/lib/pickFile';
import { describeCrmError } from '@/services/crm/client';
import type { Lead } from '@/services/crm/leads';
import { senderContext, type SessionMessage } from '@/services/crm/sequences';
import {
  parseTemplate,
  resolveValues,
  reusableHeaderUrl,
  sendSession,
  sendTemplate,
  slotsOf,
  uploadSendMedia,
  type MediaFormat,
  type PickedFile,
  type Slot,
} from '@/services/crm/whatsapp';
import { useAccountsStore } from '@/stores/accounts';
import { savedMapping, useRecentTemplates, useWhatsAppConfig, useWhatsAppStore, type VariableSource } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { rtlFlip } from '@/lib/rtl';
import { useDesktop } from '@/hooks/useDesktop';

/** Quick schedule choices, as offsets from now or fixed times of day. */
const scheduleOptions = (now: Date) => {
  const at = (days: number, h: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  return [
    { key: 'h1', date: new Date(now.getTime() + 3600_000) },
    { key: 'evening', date: at(now.getHours() >= 18 ? 1 : 0, 19) },
    { key: 'tomorrow', date: at(1, 10) },
    { key: 'days2', date: at(2, 10) },
    { key: 'week', date: at(7, 10) },
  ];
};

/** Desktop: the page as a card over a dimmed backdrop (a click outside closes it). Elsewhere: the page itself. */
export default function SendWhatsAppScreen() {
  const { t } = useTranslation();
  const desktop = useDesktop();
  const { colors, radius, shadow } = useTheme();
  if (!desktop) return <SendWhatsApp />;
  return (
    <View style={styles.overlay}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={() => goBack()} accessibilityRole="button" accessibilityLabel={t('common.close')} />
      <View style={[styles.card, shadow.floating, { backgroundColor: colors.background, borderRadius: radius.xl, borderColor: colors.border }]}>
        <SendWhatsApp />
      </View>
    </View>
  );
}

function SendWhatsApp() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // `channelId`: the number the conversation is on (from a chat), so the template comes from the same number.
  const { leadId, channelId: fromChat } = useLocalSearchParams<{ leadId: string; channelId?: string }>();
  const lead = useLead(leadId);
  const config = useWhatsAppConfig();
  const channels = useWaChannels();
  const [channelId, setChannelId] = useState<string | null>(fromChat || config.channelId);
  const accountId = useAccountsStore((s) => s.activeId);
  const recent = useRecentTemplates(accountId);
  const channel = channelId ?? channels.data?.[0]?.id ?? null;
  const [mode, setMode] = useState<'template' | 'message'>('template');
  const templates = useTemplates(channel, 'approved');
  const [picked, setPicked] = useState<Template | null>(null);
  const [search, setSearch] = useState('');

  if (!channel) {
    return (
      <Screen title={t('wa.sendTitle')} back>
        {channels.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ padding: 24 }} />
        ) : (
          <EmptyState
            icon={<Send size={26} color="#fff" />}
            title={t('wa.noChannelTitle')}
            body={t('wa.noChannelBody')}
            action={t('whatsapp.settings')}
            onAction={() => router.replace('/(app)/settings/whatsapp')}
          />
        )}
      </Screen>
    );
  }

  if (picked) return <Compose template={picked} lead={lead.data ?? null} channelId={channel} onBack={() => setPicked(null)} />;

  // Recently sent ones first (most follow-ups reuse the same few), then the rest as listed.
  const rank = (id: string) => (recent.includes(id) ? recent.indexOf(id) : recent.length);
  const list = (templates.data ?? [])
    .filter((x) => !search.trim() || x.name.toLowerCase().includes(search.trim().toLowerCase()))
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x.id) - rank(b.x.id) || a.i - b.i)
    .map(({ x }) => x);

  const header = (
    <View style={{ gap: 10 }}>
      {(channels.data?.length ?? 0) > 1 ? <ChannelSelect label={t('wa.sendFrom')} channels={channels.data!} value={channel} onChange={setChannelId} /> : null}
      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={[
          { value: 'template', label: t('wa.modeTemplate') },
          { value: 'message', label: t('wa.modeMessage') },
        ]}
      />
    </View>
  );

  if (mode === 'message') {
    return <MessageCompose header={header} lead={lead.data ?? null} channelId={channel} />;
  }

  return (
    <Screen title={t('wa.sendTitle')} subtitle={lead.data ? t('wa.toLead', { name: lead.data.name }) : undefined} back scroll>
      <View style={{ gap: 12, marginTop: 8 }}>
        {header}
        <SearchField value={search} onChangeText={setSearch} placeholder={t('whatsapp.searchTemplates')} />
        {templates.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: 24 }} /> : null}
        {templates.error ? <Text tone="danger">{describeCrmError(templates.error)}</Text> : null}
        {!templates.isLoading && !list.length ? (
          <EmptyState
            icon={<Search size={26} color="#fff" />}
            title={t('wa.noApproved')}
            body={t('wa.noApprovedBody')}
            action={t('whatsapp.newTemplate')}
            onAction={() => router.push({ pathname: '/(app)/whatsapp/template-new', params: { channelId: channel } })}
          />
        ) : null}
        {list.map((tpl) => {
          const p = parseTemplate(tpl.components);
          return (
            <Pressable key={tpl.id} onPress={() => setPicked(tpl)}>
              <Card style={{ gap: 6 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                    {tpl.name}
                  </Text>
                  {recent.includes(tpl.id) ? (
                    <Text variant="micro" tone="primary" style={{ marginEnd: 6 }}>
                      {t('wa.recent', { defaultValue: 'Recent' })}
                    </Text>
                  ) : null}
                  <Text variant="micro" tone="faint">
                    {tpl.language}
                  </Text>
                </Row>
                {p.header.format === 'TEXT' && p.header.text ? (
                  <Text variant="caption" style={{ fontWeight: '700' }} numberOfLines={1}>
                    {p.header.text}
                  </Text>
                ) : p.header.format !== 'NONE' ? (
                  <Row gap={4}>
                    <FileText size={12} color={colors.textMuted} />
                    <Text variant="caption" tone="muted">
                      {t(`wa.headerType.${p.header.format}`)}
                    </Text>
                  </Row>
                ) : null}
                <Text variant="caption" tone="muted" numberOfLines={3}>
                  {p.body}
                </Text>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

/** Free-form message (text or media + caption) to one lead. */
function MessageCompose({ header, lead, channelId }: { header: React.ReactNode; lead: Lead | null; channelId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [message, setMessage] = useState<SessionMessage>({ type: 'text', text: '' });
  const [scheduleAt, setScheduleAt] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);
  // Reset on each pick: the options are relative to the moment one is chosen, not when the page opened.
  const [now, setNow] = useState(() => new Date());

  const send = async () => {
    if (!lead) return;
    if (!isSessionReady(message)) return showAlert(message.type === 'text' ? t('wa.needText') : t('wa.needMedia'));
    setSending(true);
    try {
      await sendSession({ channelId, contactId: lead.id, message, lead, ctx: senderContext(), at: scheduleAt ?? undefined });
      void qc.invalidateQueries({ queryKey: waKeys.schedules(lead.id) });
      showAlert(scheduleAt ? t('wa.scheduled') : t('wa.sent'), scheduleAt ? scheduleAt.toLocaleString() : t('wa.sentBody', { name: lead.name }));
      goBack();
    } catch (err) {
      showAlert(t('wa.sendFailed'), describeCrmError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen
      title={t('wa.sendTitle')}
      subtitle={lead ? t('wa.toLead', { name: lead.name }) : undefined}
      back
      scroll
      footer={
        <Button
          title={scheduleAt ? t('wa.scheduleFor', { when: scheduleAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }) : t('wa.sendNow')}
          icon={scheduleAt ? <CalendarClock size={18} color="#fff" /> : <Send size={18} color="#fff" />}
          loading={sending}
          disabled={!lead || !isSessionReady(message)}
          onPress={() => void send()}
        />
      }
    >
      <View style={{ gap: 14, marginTop: 8, paddingBottom: 24 }}>
        {header}
        <Card>
          <SessionComposer value={message} onChange={setMessage} />
        </Card>
        <Card style={{ gap: 10 }}>
          <Row gap={8}>
            <CalendarClock size={18} color={colors.textMuted} />
            <Text variant="h3">{t('wa.when')}</Text>
          </Row>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Chip label={t('wa.now')} selected={!scheduleAt} onPress={() => setScheduleAt(null)} />
            {scheduleOptions(now).map((o) => (
              <Chip key={o.key} label={t(`wa.at.${o.key}`)} selected={scheduleAt?.getTime() === o.date.getTime()} onPress={() => {
                  const fresh = new Date();
                  setNow(fresh);
                  setScheduleAt(scheduleOptions(fresh).find((x) => x.key === o.key)?.date ?? o.date);
                }}
              />
            ))}
          </Row>
        </Card>
      </View>
    </Screen>
  );
}

function Compose({
  template,
  lead,
  channelId,
  onBack,
}: {
  template: Template;
  lead: import('@/services/crm/leads').Lead | null;
  channelId: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const accountId = useAccountsStore((s) => s.activeId);
  const setMapping = useWhatsAppStore((s) => s.setMapping);
  const noteTemplate = useWhatsAppStore((s) => s.noteTemplate);
  const parsed = useMemo(() => parseTemplate(template.components), [template]);
  const slots = useMemo(() => slotsOf(parsed), [parsed]);
  const ctx = useMemo(() => senderContext(), []);
  // The mapping this user last used for the template; otherwise every variable starts empty.
  const [mapping, setLocalMapping] = useState<Record<string, VariableSource>>(() => ({ ...savedMapping(accountId, template.id) }));
  const mediaFormat =
    parsed.header.format === 'IMAGE' || parsed.header.format === 'VIDEO' || parsed.header.format === 'DOCUMENT' ? (parsed.header.format as MediaFormat) : null;
  const [file, setFile] = useState<PickedFile | null>(null);
  const [scheduleAt, setScheduleAt] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);
  // Reset on each pick: the options are relative to the moment one is chosen, not when the page opened.
  const [now, setNow] = useState(() => new Date());

  const values = resolveValues(slots, mapping, lead, ctx);
  const byName = (part: Slot['part']) => (name: string) => values[`${part}:${name}`] || undefined;
  const missing = slots.filter((s) => !values[s.key]?.trim());

  const pick = async () => {
    if (!mediaFormat) return;
    const f = await pickForFormat(mediaFormat);
    if (!f) return;
    if (f.size && f.size > MAX_BYTES[mediaFormat])
      return showAlert(t('wa.tooLarge'), t('wa.tooLargeBody', { mb: Math.round(MAX_BYTES[mediaFormat] / 1048576) }));
    setFile(f);
  };

  const send = async () => {
    if (!lead) return;
    if (missing.length) return showAlert(t('wa.fillVariables'), missing.map((s) => `{{${s.name}}}`).join(', '));
    if (mediaFormat && !file && !reusableHeaderUrl(parsed)) return showAlert(t('wa.needMedia'));
    setSending(true);
    try {
      if (accountId) setMapping(accountId, template.id, mapping);
      const link = mediaFormat ? (file ? await uploadSendMedia(mediaFormat, file) : reusableHeaderUrl(parsed)) : undefined;
      await sendTemplate({
        channelId,
        contactId: lead.id,
        template,
        values,
        headerMedia: mediaFormat && link ? { format: mediaFormat, link, filename: file?.name } : undefined,
        at: scheduleAt ?? undefined,
      });
      if (accountId) noteTemplate(accountId, template.id);
      void qc.invalidateQueries({ queryKey: waKeys.schedules(lead.id) });
      showAlert(scheduleAt ? t('wa.scheduled') : t('wa.sent'), scheduleAt ? scheduleAt.toLocaleString() : t('wa.sentBody', { name: lead.name }));
      goBack();
    } catch (err) {
      showAlert(t('wa.sendFailed'), describeCrmError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen
      title={template.name}
      subtitle={lead ? t('wa.toLead', { name: lead.name }) : undefined}
      back={false}
      right={
        <Pressable onPress={onBack} hitSlop={10}>
          <Text tone="primary" variant="bodyStrong">
            {t('wa.change')}
          </Text>
        </Pressable>
      }
      scroll
      footer={
        <Button
          title={scheduleAt ? t('wa.scheduleFor', { when: scheduleAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }) : t('wa.sendNow')}
          icon={scheduleAt ? <CalendarClock size={18} color="#fff" /> : <Send size={18} color="#fff" />}
          loading={sending}
          disabled={!lead}
          onPress={() => void send()}
        />
      }
    >
      <View style={{ gap: 14, marginTop: 8, paddingBottom: 24 }}>
        <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
          <ChevronLeft size={16} color={colors.primary} style={rtlFlip()} />
          <Text variant="caption" tone="primary" style={{ fontWeight: '700' }}>
            {t('wa.allTemplates')}
          </Text>
        </Pressable>
        <TemplatePreview template={parsed} values={byName('body')} headerValues={byName('header')} mediaUri={file?.uri} mediaName={file?.name} />

        {mediaFormat ? (
          <Card style={{ gap: 10 }}>
            <Text variant="h3">{t('wa.headerMedia')}</Text>
            <Pressable onPress={() => void pick()} style={[styles.drop, { borderColor: file ? colors.success : colors.borderStrong, borderRadius: radius.md }]}>
              <Paperclip size={20} color={file ? colors.success : colors.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {file ? file.name : t('wa.pickMedia', { kind: t(`wa.headerType.${mediaFormat}`).toLowerCase() })}
                </Text>
                <Text variant="caption" tone="muted">
                  {mediaFormat === 'DOCUMENT' ? t('wa.fromFiles') : t('wa.fromGallery')}
                </Text>
              </View>
            </Pressable>
          </Card>
        ) : null}

        <Card style={{ gap: 10 }}>
          <Text variant="h3">{t('wa.variables')}</Text>
          <VariableMapper slots={slots} mapping={mapping} onChange={setLocalMapping} resolve={(s) => values[s.key] ?? ''} />
        </Card>

        <Card style={{ gap: 10 }}>
          <Row gap={8}>
            <CalendarClock size={18} color={colors.textMuted} />
            <Text variant="h3">{t('wa.when')}</Text>
          </Row>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Chip label={t('wa.now')} selected={!scheduleAt} onPress={() => setScheduleAt(null)} />
            {scheduleOptions(now).map((o) => (
              <Chip key={o.key} label={t(`wa.at.${o.key}`)} selected={scheduleAt?.getTime() === o.date.getTime()} onPress={() => {
                  const fresh = new Date();
                  setNow(fresh);
                  setScheduleAt(scheduleOptions(fresh).find((x) => x.key === o.key)?.date ?? o.date);
                }}
              />
            ))}
          </Row>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  card: { width: '100%', maxWidth: 620, height: '88%', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  drop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderStyle: 'dashed' },
});
