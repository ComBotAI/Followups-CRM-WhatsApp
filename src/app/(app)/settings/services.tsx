/**
 * Services: what the business offers, and the reminders that bring customers
 * back. Each service's reminders are follow-up series that start when a visit
 * with it is recorded (and start over on the next visit).
 */
import { parseAmount } from '@/lib/money';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { BellRing, ChevronRight, Plus, Sparkles, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Input, Row, Screen, Sheet, Text } from '@/components/ui';
import { useSequences, useServices, waKeys } from '@/hooks/queries';
import { confirmAction, showAlert } from '@/lib/dialog';
import { humanMinutes } from '@/lib/followups';
import { rtlFlip } from '@/lib/rtl';
import { describeCrmError } from '@/services/crm/client';
import { cumulativeMinutes, type Sequence } from '@/services/crm/sequences';
import { deleteService, PRESETS, saveService, type Service } from '@/services/crm/services';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';

function ServicesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const services = useServices();
  const sequences = useSequences();
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const list = services.data ?? [];
  const remindersOf = (id: string) => (sequences.data ?? []).filter((s) => s.trigger.kind === 'service' && s.trigger.serviceId === id);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['services'] });
    void qc.invalidateQueries({ queryKey: waKeys.sequences });
  };

  const applyPreset = async (key: string) => {
    const ok = await confirmAction({
      title: t('services.presetQ', { name: t(`services.preset.${key}`) }),
      message: t('services.presetBody'),
      confirmText: t('services.add'),
      cancelText: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      for (const [i, p] of PRESETS[key].entries()) await saveService({ name: t(`services.item.${p.key}`, { defaultValue: p.name }), price: null, resets: [], remindDays: p.days, active: true, sort: list.length + i });
      refresh();
      showAlert(t('services.presetDone'), t('services.presetNext'));
    } catch (e) {
      showAlert(t('common.couldNotSave'), describeCrmError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={t('services.title')}
      subtitle={t('services.sub')}
      back
      scroll
      onRefresh={() => services.refetch()}
      footer={<Button title={t('services.add')} icon={<Plus size={18} color="#fff" />} onPress={() => setEditing('new')} />}
    >
      <View style={{ gap: 12, marginTop: 8, paddingBottom: 24 }}>
        <Card style={{ gap: 6 }}>
          <Row gap={8}>
            <BellRing size={18} color={colors.primary} />
            <Text variant="h3">{t('services.howTitle')}</Text>
          </Row>
          <Text variant="caption" tone="muted">
            {t('services.how')}
          </Text>
        </Card>

        {services.isLoading || busy ? <ActivityIndicator color={colors.primary} style={{ padding: 16 }} /> : null}
        {services.error ? <Text tone="danger">{describeCrmError(services.error)}</Text> : null}

        {!list.length && !services.isLoading && !services.error ? (
          <Card style={{ gap: 10 }}>
            <Row gap={8}>
              <Sparkles size={18} color={colors.accent} />
              <Text variant="h3">{t('services.startFrom')}</Text>
            </Row>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {Object.keys(PRESETS).map((k) => (
                <Chip key={k} label={t(`services.preset.${k}`)} onPress={() => void applyPreset(k)} />
              ))}
            </Row>
          </Card>
        ) : null}

        {list.map((s) => {
          const reminders = remindersOf(s.id);
          return (
            <Pressable key={s.id} onPress={() => setEditing(s)}>
              <Card style={{ gap: 6, opacity: s.active ? 1 : 0.55 }}>
                <Row gap={8}>
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {s.name}
                  </Text>
                  {s.price != null ? (
                    <Text variant="caption" tone="muted">
                      {s.price}
                    </Text>
                  ) : null}
                  <ChevronRight size={18} color={colors.textFaint} style={rtlFlip()} />
                </Row>
                {reminders.length ? (
                  reminders.map((r) => <ReminderLine key={r.id} seq={r} />)
                ) : (
                  <Text variant="caption" tone="warning">
                    {s.remindDays ? t('services.noReminderDays', { count: s.remindDays }) : t('services.noReminder')}
                  </Text>
                )}
              </Card>
            </Pressable>
          );
        })}
      </View>
      {editing ? (
        <ServiceSheet
          service={editing === 'new' ? null : editing}
          all={list}
          reminders={editing === 'new' ? [] : remindersOf(editing.id)}
          onClose={(changed) => {
            setEditing(null);
            if (changed) refresh();
          }}
        />
      ) : null}
    </Screen>
  );
}

function ReminderLine({ seq }: { seq: Sequence }) {
  const { t } = useTranslation();
  const offsets = cumulativeMinutes(seq.steps);
  const api = useWhatsAppConfig().mode === 'api';
  const needsTemplate = api && seq.steps.some((s) => s.kind === 'session');
  return (
    <Text variant="caption" tone={seq.active ? 'muted' : 'warning'} numberOfLines={2}>
      {`${seq.name} · ${offsets.map((m) => humanMinutes(m, t)).join(', ')}${seq.repeat ? ` · ${t('services.repeats')}` : ''}`}
      {!seq.active ? ` · ${needsTemplate ? t('services.offPickTemplate') : t('services.off')}` : ''}
    </Text>
  );
}

function ServiceSheet({ service, all, reminders, onClose }: { service: Service | null; all: Service[]; reminders: Sequence[]; onClose: (changed: boolean) => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const [name, setName] = useState(service?.name ?? '');
  const [price, setPrice] = useState(service?.price != null ? String(service.price) : '');
  const [resets, setResets] = useState<string[]>(service?.resets ?? []);
  const [active, setActive] = useState(service?.active ?? true);
  const [days, setDays] = useState(service?.remindDays != null ? String(service.remindDays) : '');
  const [busy, setBusy] = useState(false);

  const save = async (then?: (id: string) => void) => {
    if (!name.trim()) return showAlert(t('services.needName'));
    setBusy(true);
    try {
      const amount = price.trim() ? parseAmount(price) : null;
      const id = await saveService({
        id: service?.id,
        name,
        price: Number.isFinite(amount) ? amount : null,
        resets,
        remindDays: Number(days) > 0 ? Number(days) : null,
        active,
        sort: service?.sort ?? all.length,
      });
      onClose(true);
      then?.(id);
    } catch (e) {
      showAlert(t('common.couldNotSave'), describeCrmError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!service) return;
    const ok = await confirmAction({
      title: t('services.deleteQ', { name: service.name }),
      message: t('services.deleteBody'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteService(service.id);
    } catch (e) {
      // Failed: keep the sheet open rather than look deleted.
      return showAlert(t('common.couldNotSave'), describeCrmError(e));
    }
    onClose(true);
  };

  // The series editor, started on this service with the usual gap as the first wait; the message is the user's own.
  const addReminder = (id: string) =>
    router.push({ pathname: '/(app)/followups/edit', params: { serviceId: id, name: t('services.reminderName', { service: name.trim() }), days: days || undefined } });

  return (
    <Sheet open onClose={() => onClose(false)} locked={busy} title={service ? service.name : t('services.new')} footer={<Button title={t('common.save')} loading={busy} onPress={() => void save()} />}>
      <View style={{ gap: 14 }}>
        <Input label={t('services.name')} value={name} onChangeText={setName} placeholder={t('services.namePh')} />
        <Input label={t('services.usualPrice')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder={t('services.optional')} />
        <Input label={t('services.remindAfter')} value={days} onChangeText={(v) => setDays(v.replace(/\D/g, ''))} keyboardType="number-pad" hint={t('services.remindAfterHint')} />

        {all.filter((x) => x.id !== service?.id).length ? (
          <View style={{ gap: 6 }}>
            <Text variant="caption" tone="muted">
              {t('services.alsoCounts')}
            </Text>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {all
                .filter((x) => x.id !== service?.id)
                .map((x) => (
                  <Chip key={x.id} small label={x.name} selected={resets.includes(x.id)} onPress={() => setResets(resets.includes(x.id) ? resets.filter((r) => r !== x.id) : [...resets, x.id])} />
                ))}
            </Row>
          </View>
        ) : null}

        {/* Reminders: new services save first, then open the editor. */}
        {(
          <View style={{ gap: 6 }}>
            <Text variant="caption" tone="muted">
              {t('services.reminders')}
            </Text>
            {reminders.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => {
                  onClose(false);
                  router.push({ pathname: '/(app)/followups/edit', params: { id: r.id } });
                }}
                style={[styles.reminder, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}
              >
                <View style={{ flex: 1 }}>
                  <ReminderLine seq={r} />
                </View>
                <ChevronRight size={16} color={colors.textFaint} style={rtlFlip()} />
              </Pressable>
            ))}
            <Button title={t('services.addReminder')} size="sm" variant="secondary" icon={<Plus size={14} color={colors.primary} />} onPress={() => void save(addReminder)} />
          </View>
        )}

        {service ? (
          <Row gap={8}>
            <Chip label={active ? t('services.activeOn') : t('services.activeOff')} selected={active} onPress={() => setActive(!active)} />
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => void remove()} hitSlop={8} style={{ padding: 6 }}>
              <Trash2 size={18} color={colors.danger} />
            </Pressable>
          </Row>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  reminder: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
});

/** Members whose role doesn't include it get a "not allowed" page (see `P.app`). */
export default function ServicesScreenRoute() {
  return (
    <RequireCan all={[P.app.services]}>
      <ServicesScreen />
    </RequireCan>
  );
}
