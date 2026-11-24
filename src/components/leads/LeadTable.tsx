/**
 * Desktop contacts list: one row per contact in aligned columns (name, status,
 * type, tags, next step, owner), a checkbox to select, hover highlight, and
 * the row opens the contact panel.
 */
import { Check, MessageCircle, Phone } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useLeadNextLine } from '@/components/leads/LeadCard';
import { Avatar, StatusPill, Text, useStatusColor } from '@/components/ui';
import { callPhone, messageOnWhatsApp, plainWhatsApp } from '@/lib/actions';
import { formatPhone } from '@/lib/phone';
import type { Lead } from '@/services/crm/leads';
import { openContact } from '@/stores/contactPanel';
import { useTheme } from '@/theme/ThemeProvider';

const COLS = { name: 2.4, status: 1.2, type: 1.1, tags: 1.5, next: 1.7, owner: 1.1 };

export function LeadTableHeader({ allSelected, onSelectAll }: { allSelected: boolean; onSelectAll: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const cell = (label: string, flex: number) => (
    <Text variant="micro" tone="faint" style={{ flex, letterSpacing: 0.6 }} numberOfLines={1}>
      {label.toUpperCase()}
    </Text>
  );
  return (
    <View style={[styles.row, styles.header, { borderBottomColor: colors.border }]}>
      <Box checked={allSelected} onPress={onSelectAll} />
      {cell(t('common.name'), COLS.name)}
      {cell(t('common.status'), COLS.status)}
      {cell(t('leads.contactType'), COLS.type)}
      {cell(t('leads.tags'), COLS.tags)}
      {cell(t('leads.nextStep'), COLS.next)}
      {cell(t('filter.assignedTo'), COLS.owner)}
      <View style={{ width: 84 }} />
    </View>
  );
}

function Box({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[styles.box, { borderColor: checked ? colors.primary : colors.borderStrong, backgroundColor: checked ? colors.primary : 'transparent' }]}>
      {checked ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
    </Pressable>
  );
}

function LeadTableRowInner({ lead, selected, selecting, onSelect }: { lead: Lead; selected: boolean; selecting: boolean; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const statusColor = useStatusColor();
  const next = useLeadNextLine()(lead);
  return (
    <Pressable
      onPress={() => (selecting ? onSelect(lead.id) : openContact(lead.id))}
      style={({ hovered }: { hovered?: boolean }) => [
        styles.row,
        { borderBottomColor: colors.border, backgroundColor: selected ? colors.primarySoft : hovered ? colors.surfacePressed : colors.surface },
      ]}
    >
      <Box checked={selected} onPress={() => onSelect(lead.id)} />
      <View style={[styles.nameCell, { flex: COLS.name }]}>
        <Avatar name={lead.name} uri={lead.avatarUrl} size={34} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {lead.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {lead.phone ? formatPhone(lead.phone) : t('leads.noNumber')}
          </Text>
        </View>
      </View>
      <View style={{ flex: COLS.status, alignItems: 'flex-start' }}>
        <StatusPill label={t(`status.${lead.status || 'New'}`, { defaultValue: lead.status || 'New' })} color={statusColor(lead.status || 'New')} />
      </View>
      <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: COLS.type }}>
        {t(`contactType.${lead.contactType || 'Leads'}`, { defaultValue: lead.contactType || 'Leads' })}
      </Text>
      <View style={[styles.tags, { flex: COLS.tags }]}>
        {lead.tags.slice(0, 2).map((tg) => (
          <View key={tg.id} style={[styles.tag, { borderColor: tg.color || colors.border, backgroundColor: tg.color ? `${tg.color}1F` : colors.surfaceAlt }]}>
            <Text style={[styles.tagText, { color: colors.text }]} numberOfLines={1}>
              {tg.name}
            </Text>
          </View>
        ))}
        {lead.tags.length > 2 ? (
          <Text variant="micro" tone="faint">
            +{lead.tags.length - 2}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" tone={next.tone} numberOfLines={1} style={{ flex: COLS.next }}>
        {next.text}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: COLS.owner }}>
        {lead.assignedName || '—'}
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={() => messageOnWhatsApp({ phone: lead.phone, leadId: lead.id })}
          onLongPress={plainWhatsApp(lead.phone)}
          disabled={!lead.phone} style={[styles.act, { backgroundColor: colors.whatsappSoft }]}>
          <MessageCircle size={16} color={colors.whatsapp} />
        </Pressable>
        <Pressable onPress={() => void callPhone(lead.phone)} disabled={!lead.phone} style={[styles.act, { backgroundColor: colors.primarySoft }]}>
          <Phone size={16} color={colors.primary} />
        </Pressable>
      </View>
    </Pressable>
  );
}

export const LeadTableRow = memo(LeadTableRowInner);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  header: { paddingVertical: 8 },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
  tag: { paddingHorizontal: 7, height: 20, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', maxWidth: 110 },
  tagText: { fontSize: 11, fontWeight: '600' },
  actions: { width: 84, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  act: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
