/**
 * After Meta's signup: confirm the number and create the channel, then
 * register it so it can send. Opened with the return's params
 * (`status`, `token`, `code`, `message`…), from `useSignup` or the
 * `/channel-connected` landing page.
 */
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleAlert, CircleCheck } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { CrmApiError } from '@ab-ecosystem/cpaas';

import { ChannelIcon, qualityColor, SetupCard } from '@/components/channels/ChannelBits';
import { Button, Card, Chip, EmptyState, Input, Loading, Row, Screen, Text } from '@/components/ui';
import { StatusPill } from '@/components/ui/kit';
import { useRefreshChannels } from '@/hooks/channels';
import { canPickCurrency, CHANNEL_COLORS, completeSignup, CURRENCIES, pendingSignup, type Channel, type ChannelCurrency } from '@/services/crm/channels';
import { goBack } from '@/lib/nav';
import { describeCrmError } from '@/services/crm/client';
import { useTheme } from '@/theme/ThemeProvider';

export default function ConnectChannelScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const refresh = useRefreshChannels();
  const ret = useLocalSearchParams<{ status?: string; token?: string; message?: string; code?: string }>();
  const pending = useQuery({
    queryKey: ['channels', 'pending', ret.token ?? ''],
    queryFn: () => pendingSignup(ret.token!),
    enabled: ret.status !== 'error' && !!ret.token,
    retry: false,
    staleTime: Infinity,
  });

  // The form starts from the service's suggestions once they arrive.
  const [form, setForm] = useState<{ name: string; color: string; currency: ChannelCurrency; numberId: string } | null>(null);
  const d = pending.data;
  if (d && !form) {
    setForm({ name: d.defaults.name, color: d.defaults.color || CHANNEL_COLORS[0], currency: d.defaults.currency, numberId: d.phoneNumber?.id ?? '' });
  }
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Channel | null>(null);
  const [existing, setExisting] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const openChannel = (id: string) => router.replace({ pathname: '/(app)/channels/[id]', params: { id } });

  // Opened without a signup to read (no token): an error, not an endless spinner.
  if (ret.status === 'error' || pending.isError || !ret.token) {
    const message = ret.status === 'error' || !ret.token ? ret.message || ret.code || t('common.errorTitle') : describeCrmError(pending.error);
    return (
      <Screen title={t('channels.connectWhatsApp')} back>
        <EmptyState
          icon={<CircleAlert size={28} color={colors.danger} />}
          title={t('channels.signupFailed')}
          body={message}
          action={t('common.back')}
          onAction={() => goBack('/(app)/channels')}
        />
      </Screen>
    );
  }
  if (!d || !form) {
    return (
      <Screen title={t('channels.connectWhatsApp')} back>
        <Loading label={t('channels.readingNumber')} />
      </Screen>
    );
  }

  const create = async () => {
    if (!form.name.trim()) return;
    if (d.numbers.length > 1 && !form.numberId) return;
    setBusy(true);
    setExisting(null);
    setFormError(null);
    try {
      const channel = await completeSignup({
        token: d.id,
        phoneNumberId: form.numberId || undefined,
        name: form.name.trim(),
        color: form.color,
        // Only Indian numbers choose; others keep the currency the service sets.
        currency: canPickCurrency((d.numbers.find((n) => n.id === form.numberId) ?? d.numbers[0])?.displayPhoneNumber) ? form.currency : d.defaults.currency,
      });
      void refresh();
      setCreated(channel);
    } catch (err) {
      // Our own unfinished channel on this number: resume it instead of making another.
      const other = err instanceof CrmApiError && err.code === 'phone_number_pending' ? (err.details as { channel?: string } | undefined)?.channel : undefined;
      setExisting(other ?? null);
      setFormError(other ? null : describeCrmError(err));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Screen title={t('channels.connectWhatsApp')} back scroll>
        <View style={{ gap: 14, marginTop: 8 }}>
          <Card style={{ gap: 8, alignItems: 'center' }}>
            <CircleCheck size={36} color={colors.success} />
            <Text variant="h3" center>
              {t('channels.created', { name: created.basic_details.name })}
            </Text>
            <Text variant="caption" tone="muted" center>
              {t('channels.createdBody')}
            </Text>
          </Card>
          <SetupCard
            channel={created}
            onDone={() => {
              void refresh();
              openChannel(created.id);
            }}
          />
          <Button title={t('channels.later')} variant="ghost" full onPress={() => openChannel(created.id)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={t('channels.connectWhatsApp')} subtitle={t('channels.confirmSub')} back scroll>
      <View style={{ gap: 14, marginTop: 8 }}>
        {d.numbers.length > 1 ? <Text variant="h3">{t('channels.pickNumber')}</Text> : null}
        <Card padded={false}>
          {d.numbers.map((n) => {
            const on = d.numbers.length === 1 || form.numberId === n.id;
            return (
              <Pressable
                key={n.id}
                onPress={() => setForm({ ...form, numberId: n.id })}
                disabled={d.numbers.length === 1}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.number, { backgroundColor: on && d.numbers.length > 1 ? colors.primarySoft : 'transparent', borderRadius: radius.lg }]}
              >
                <ChannelIcon type="whatsapp" color={form.color} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{n.displayPhoneNumber}</Text>
                  <Text variant="caption" tone="muted">
                    {n.verifiedName}
                  </Text>
                </View>
                {n.qualityRating ? (
                  <StatusPill label={t('channels.quality', { rating: n.qualityRating })} color={qualityColor(n.qualityRating, colors)} />
                ) : null}
              </Pressable>
            );
          })}
        </Card>

        <Card style={{ gap: 14 }}>
          <Input label={t('channels.name')} value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder={t('channels.namePlaceholder')} />
          <View style={{ gap: 6 }}>
            <Text variant="caption" tone="muted">
              {t('channels.color')}
            </Text>
            <Row gap={10} style={{ flexWrap: 'wrap' }}>
              {CHANNEL_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setForm({ ...form, color: c })}
                  accessibilityRole="radio"
                  accessibilityLabel={c}
                  accessibilityState={{ checked: form.color === c }}
                  style={[styles.swatch, { backgroundColor: c, borderColor: form.color === c ? colors.text : 'transparent' }]}
                />
              ))}
            </Row>
          </View>
          {canPickCurrency((d.numbers.find((n) => n.id === form.numberId) ?? d.numbers[0])?.displayPhoneNumber) ? (
            <View style={{ gap: 6 }}>
              <Text variant="caption" tone="muted">
                {t('channels.currency')}
              </Text>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                {CURRENCIES.map((c) => (
                  <Chip key={c} label={c} selected={form.currency === c} onPress={() => setForm({ ...form, currency: c })} />
                ))}
              </Row>
              <Text variant="micro" tone="faint">
                {t('channels.currencyHint')}
              </Text>
            </View>
          ) : null}
        </Card>

        {existing ? (
          <Card style={{ gap: 10 }}>
            <Text>{t('channels.alreadyPending')}</Text>
            <Button title={t('channels.openPending')} variant="secondary" onPress={() => openChannel(existing)} />
          </Card>
        ) : null}
        {formError ? <Text tone="danger">{formError}</Text> : null}

        <Button
          title={t('channels.create')}
          onPress={() => void create()}
          loading={busy}
          disabled={!form.name.trim() || (d.numbers.length > 1 && !form.numberId)}
          full
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  number: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
});
