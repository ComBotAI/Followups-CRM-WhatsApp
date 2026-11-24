/**
 * A lead in a list. One glance tells you who, where they are in the pipeline
 * (status dot + pill), and the single most useful next fact: an overdue or
 * due follow-up, otherwise the next one, otherwise "no follow-up set".
 */
import { Check, MessageCircle, Phone } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ListRow, RoundAction, StatusPill, Text, useStatusColor } from '@/components/ui';
import { callPhone, messageOnWhatsApp, plainWhatsApp } from '@/lib/actions';
import { fromNow, isOverdue, isToday } from '@/lib/time';
import type { Lead } from '@/services/crm/leads';
import { useTheme } from '@/theme/ThemeProvider';
import { openContact } from '@/stores/contactPanel';

type Props = {
  lead: Lead;
  selected?: boolean;
  selecting?: boolean;
  /** Called with the lead's id: pass one stable function for the whole list so rows stay memoised. */
  onSelect?: (id: string) => void;
  compact?: boolean;
};

export const useLeadNextLine = () => {
  const { t } = useTranslation();
  return (lead: Lead): { text: string; tone: 'danger' | 'warning' | 'muted' } => {
    const due = lead.nextFollowUp;
    if (due && isOverdue(due))
      return {
        text: t('leads.followUpOverdue', { when: fromNow(due) }),
        tone: 'danger',
      };
    if (due && isToday(due)) return { text: t('leads.followUpToday'), tone: 'warning' };
    if (due) return { text: `${t('leads.nextFollowUp')} · ${fromNow(due)}`, tone: 'muted' };
    return { text: t('leads.noFollowUp'), tone: 'muted' };
  };
};

function LeadCardInner({ lead, selected, selecting, onSelect }: Props) {
  const { colors } = useTheme();
  const statusColor = useStatusColor();
  const next = useLeadNextLine()(lead);
  const color = statusColor(lead.status || 'New');
  const open = () => (selecting ? onSelect?.(lead.id) : openContact(lead.id));
  // No swipe actions: a sideways swipe competed with scrolling and made the list feel laggy.
  // Tap opens, long press selects.
  return (
    <ListRow
      title={lead.name}
      avatarName={lead.name}
      avatarUri={lead.avatarUrl}
      dotColor={color}
      selected={selected}
      onPress={open}
      onLongPress={onSelect ? () => onSelect(lead.id) : undefined}
      subtitle={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="caption" tone={next.tone} numberOfLines={1} style={{ flexShrink: 1 }}>
            {next.text}
          </Text>
        </View>
      }
      meta={<LeadChips lead={lead} />}
      trailing={
        selecting ? (
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              borderWidth: 2,
              borderColor: selected ? colors.primary : colors.borderStrong,
              backgroundColor: selected ? colors.primary : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selected ? <Check size={15} color="#fff" /> : null}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <RoundAction
              size={38}
              tone="whatsapp"
              icon={<MessageCircle size={17} color="#128C7E" />}
              disabled={!lead.phone}
              onPress={() => messageOnWhatsApp({ phone: lead.phone, leadId: lead.id })}
              onLongPress={plainWhatsApp(lead.phone)}
            />
            <RoundAction
              size={38}
              icon={<Phone size={17} color={colors.primary} />}
              disabled={!lead.phone}
              onPress={() =>
                void callPhone(lead.phone)
              }
            />
          </View>
        )
      }
    />
  );
}

export const LeadCard = memo(LeadCardInner);

/** The pipeline chip: the contact's status. */
export function LeadChips({ lead }: { lead: Lead }) {
  const { t } = useTranslation();
  const statusColor = useStatusColor();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 5 }}>
      <StatusPill label={t(`status.${lead.status || 'New'}`, { defaultValue: lead.status || 'New' })} color={statusColor(lead.status || 'New')} />
    </View>
  );
}
