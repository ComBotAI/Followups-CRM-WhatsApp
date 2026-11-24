import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckSquare, MessageCircle, Phone } from 'lucide-react-native';
import { StyleSheet } from 'react-native';

import { showAlert } from '@/lib/dialog';
import { Button, Chip, Input, Row, Sheet, Text } from '@/components/ui';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { applyLeadChange, showLocalReminders } from '@/hooks/useReminderActions';
import type { Lead } from '@/services/crm/leads';
import { REMINDER_KINDS, reminderKind, type Reminder, type ReminderKind } from '@/services/crm/records';
import { putReminder } from '@/services/reminders';
import { useMyId, useMyName } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';

const QUICK = [
  { key: '5m', ms: 5 * 60_000 },
  { key: '15m', ms: 15 * 60_000 },
  { key: '30m', ms: 30 * 60_000 },
  { key: '1h', ms: 3600_000 },
  { key: '3h', ms: 3 * 3600_000 },
  { key: 'tomorrow', ms: -1 },
];

export const tomorrowTen = (from: number, days = 1) => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d;
};

/**
 * Sets a reminder for a lead, or with `reminder` moves that one (its old alarm
 * goes): changing the follow-up must not leave the old reminder ringing.
 */
export function ReminderSheet({
  lead,
  reminder,
  open,
  onClose,
}: {
  lead: Pick<Lead, 'id' | 'name' | 'phone'>;
  reminder?: Reminder;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const myName = useMyName();
  const myId = useMyId();
  const [openedAt] = useState(() => Date.now());
  const [note, setNote] = useState(reminder?.note ?? '');
  // Moving a reminder already past: start from a fresh time, not the old one.
  const [due, setDue] = useState<Date>(() =>
    reminder && Date.parse(reminder.due_at) > openedAt ? new Date(reminder.due_at) : new Date(openedAt + 15 * 60_000),
  );
  const [saving, setSaving] = useState(false);
  // Only a call reminder sets the contact's follow-up; a task or WhatsApp one just notifies and lists on Today.
  const [kind, setKind] = useState<ReminderKind>(reminder ? reminderKind(reminder) : 'call');
  const isCall = kind === 'call';

  // Saved and armed on the phone, then closed: the upload and the lead's date follow in the background.
  const save = async () => {
    setSaving(true);
    try {
      await putReminder(
        {
          id: reminder?.id,
          contact_id: lead.id,
          contact_name: lead.name,
          phone: lead.phone,
          note: note.trim() || t({ call: 'reminders.callLead', task: 'reminders.taskFor', whatsapp: 'reminders.whatsappFor' }[kind], { name: lead.name }),
          due_at: due.toISOString(),
          member_id: reminder?.member_id || myId,
          member_name: reminder?.member_name || myName,
          kind: isCall ? undefined : kind,
        },
        (l) => applyLeadChange(qc, l),
      );
      showLocalReminders(qc);
      void qc.invalidateQueries({ queryKey: ['today'] });
      onClose();
    } catch (err) {
      showAlert(t('common.couldNotSave'), err instanceof Error ? err.message : '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={reminder ? t('reminders.changeTitle', { defaultValue: 'Change reminder' }) : t('reminders.setTitle')}
      subtitle={lead.name}
      locked={saving}
      footer={<Button title={t('reminders.saveReminder')} full onPress={() => void save()} loading={saving} />}
    >
      <Input placeholder={t('reminders.placeholder')} value={note} onChangeText={setNote} autoCapitalize="sentences" autoFocus />
      <Row gap={6} style={styles.wrap}>
        {QUICK.map((q) => {
          const target = q.ms === -1 ? tomorrowTen(openedAt) : new Date(openedAt + q.ms);
          const selected = Math.abs(target.getTime() - due.getTime()) < 30_000;
          return <Chip key={q.key} label={t(`reminders.quick.${q.key}`)} selected={selected} onPress={() => setDue(target)} />;
        })}
      </Row>
      <DateTimeField
        value={due}
        minimumDate={new Date(openedAt)}
        label={t('reminders.pickDateTime')}
        selected={!QUICK.some((q) => Math.abs((q.ms === -1 ? tomorrowTen(openedAt) : new Date(openedAt + q.ms)).getTime() - due.getTime()) < 30_000)}
        onChange={setDue}
      />
      <Text variant="micro" tone="faint">
        {t('reminders.kindTitle').toUpperCase()}
      </Text>
      <Row gap={6} style={styles.wrap}>
        {REMINDER_KINDS.map((k) => {
          const Icon = { call: Phone, task: CheckSquare, whatsapp: MessageCircle }[k];
          return (
            <Chip
              key={k}
              label={t(`reminders.kind.${k}`)}
              icon={<Icon size={14} color={kind === k ? colors.primary : colors.textMuted} />}
              selected={kind === k}
              onPress={() => setKind(k)}
            />
          );
        })}
      </Row>
      <Text variant="caption" tone="muted">
        {t(`reminders.kindHint.${kind}`)}
      </Text>
      <Text variant="caption" tone="primary">
        {t('reminders.remindsAt', { when: due.toLocaleString() })}
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap' },
});

const SNOOZE = [
  { key: '1h', label: '+1 hour', at: (now: number) => new Date(now + 3600_000) },
  { key: '3h', label: '+3 hours', at: (now: number) => new Date(now + 3 * 3600_000) },
  { key: 'tomorrow', label: 'Tomorrow 10:00', at: (now: number) => tomorrowTen(now) },
  { key: '3d', label: 'In 3 days', at: (now: number) => tomorrowTen(now, 3) },
];

/** Quick snooze: one tap moves the reminder; "pick" opens a date and time. */
export function SnoozeSheet({ reminder, onSnooze, onClose }: { reminder: Reminder | null; onSnooze: (r: Reminder, due: Date) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [openedAt] = useState(() => Date.now());
  const [custom, setCustom] = useState<Date>(() => tomorrowTen(openedAt));
  const [picking, setPicking] = useState(false);
  const pick = (due: Date) => {
    if (reminder) onSnooze(reminder, due);
    onClose();
  };
  return (
    <Sheet
      open={!!reminder}
      onClose={onClose}
      title={t('reminders.snoozeTitle', { defaultValue: 'Snooze' })}
      subtitle={reminder?.contact_name || reminder?.note}
      footer={picking ? <Button title={t('reminders.snoozeSave', { defaultValue: 'Move reminder' })} full onPress={() => pick(custom)} /> : undefined}
    >
      <Row gap={6} style={styles.wrap}>
        {SNOOZE.map((s) => (
          <Chip key={s.key} label={t(`reminders.snooze.${s.key}`, { defaultValue: s.label })} onPress={() => pick(s.at(Date.now()))} />
        ))}
        <Chip label={t('reminders.snooze.pick', { defaultValue: 'Pick date & time' })} selected={picking} onPress={() => setPicking(true)} />
      </Row>
      {picking ? <DateTimeField value={custom} minimumDate={new Date(openedAt)} label={t('reminders.pickDateTime')} selected onChange={setCustom} /> : null}
    </Sheet>
  );
}
