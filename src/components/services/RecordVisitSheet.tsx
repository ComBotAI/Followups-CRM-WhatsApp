/**
 * "Record visit": which services the customer took, when, and optionally the
 * amount. Saving logs the visit and (re)starts each service's reminders.
 */
import { parseAmount, roundCents } from '@/lib/money';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Chip, EmptyState, Input, Row, Sheet, Text } from '@/components/ui';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { ServedByPicker, type ServedBy } from '@/components/visits/ServedBy';
import { useServices } from '@/hooks/queries';
import { showAlert } from '@/lib/dialog';
import { describeCrmError } from '@/services/crm/client';
import type { Lead } from '@/services/crm/leads';
import { recordVisit } from '@/services/crm/services';
import { P } from '@/lib/permissions';
import { useCan } from '@/stores/auth';

const dayStart = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
};

export function RecordVisitSheet({ contactId, lead, name, onClose }: { contactId: string; lead?: Lead; name?: string; onClose: (changed: boolean) => void }) {
  const { t } = useTranslation();
  const canManage = useCan(P.app.services);
  const qc = useQueryClient();
  const services = useServices();
  const list = (services.data ?? []).filter((s) => s.active);
  const [picked, setPicked] = useState<string[]>([]);
  const [when, setWhen] = useState<'today' | 'yesterday' | 'other'>('today');
  const [other, setOther] = useState(() => dayStart(-2));
  const [price, setPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [note, setNote] = useState('');
  const [servedBy, setServedBy] = useState<ServedBy>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    // Suggest the usual prices added up, until the user types their own.
    if (!priceTouched) {
      const sum = list.filter((s) => next.includes(s.id)).reduce((n, s) => n + (s.price ?? 0), 0);
      setPrice(sum ? String(roundCents(sum)) : '');
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const at = when === 'today' ? new Date() : when === 'yesterday' ? dayStart(-1) : other;
      const amount = price.trim() ? parseAmount(price) : null;
      const res = await recordVisit(lead ?? contactId, { serviceIds: picked, at, price: Number.isFinite(amount) ? amount : null, note, servedBy });
      void qc.invalidateQueries({ queryKey: ['services', 'contact', contactId] });
      void qc.invalidateQueries({ queryKey: ['lead', contactId] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['waTasks'] });
      void qc.invalidateQueries({ queryKey: ['wa', 'schedules', contactId] });
      void qc.invalidateQueries({ queryKey: ['visits'] });
      showAlert(
        t('services.recorded'),
        [
          res.started ? t('services.remindersStarted', { count: res.started }) : t('services.noReminders'),
          res.failed.length ? t('services.someFailed', { names: res.failed.join(', ') }) : '',
          res.profileFailed
            ? t('visits.profileFailed', {
                defaultValue: "The visit is saved, but the guest's visit count and spend could not be updated (check that your role can edit contacts).",
              })
            : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
      onClose(true);
    } catch (e) {
      showAlert(t('services.recordFailed'), describeCrmError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={() => onClose(false)}
      locked={busy}
      title={t('services.recordVisit')}
      subtitle={name ?? lead?.name}
      footer={list.length ? <Button title={t('services.saveVisit')} disabled={!picked.length} loading={busy} onPress={() => void save()} /> : undefined}
    >
      {!list.length && !services.isLoading ? (
        <EmptyState
          icon={<Sparkles size={26} color="#fff" />}
          title={t('services.emptyTitle')}
          body={t('services.emptyBody')}
          action={canManage ? t('services.setUp') : undefined}
          onAction={() => {
            onClose(false);
            router.push('/(app)/settings/services');
          }}
        />
      ) : (
        <View style={{ gap: 14 }}>
          <Text variant="caption" tone="muted">
            {t('services.whichServices')}
          </Text>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {list.map((s) => (
              <Chip key={s.id} label={s.name} selected={picked.includes(s.id)} onPress={() => toggle(s.id)} />
            ))}
          </Row>
          <Text variant="caption" tone="muted">
            {t('services.when')}
          </Text>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <Chip label={t('services.today')} selected={when === 'today'} onPress={() => setWhen('today')} />
            <Chip label={t('services.yesterday')} selected={when === 'yesterday'} onPress={() => setWhen('yesterday')} />
            <DateTimeField
              label={when === 'other' ? other.toLocaleDateString() : t('services.pickDate')}
              value={other}
              selected={when === 'other'}
              onChange={(d) => {
                setOther(d > new Date() ? new Date() : d);
                setWhen('other');
              }}
            />
          </Row>
          <ServedByPicker value={servedBy} onChange={setServedBy} />
          <Input
            label={t('services.amount')}
            value={price}
            onChangeText={(v) => {
              setPrice(v);
              // Cleared: go back to suggesting the usual prices.
              setPriceTouched(!!v.trim());
            }}
            keyboardType="decimal-pad"
            placeholder={t('services.optional')}
          />
          <Input label={t('services.note')} value={note} onChangeText={setNote} placeholder={t('services.optional')} />
          <Text variant="micro" tone="faint">
            {t('services.restartHint')}
          </Text>
        </View>
      )}
    </Sheet>
  );
}
