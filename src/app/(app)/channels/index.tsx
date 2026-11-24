/**
 * Channels: every number and inbox the workspace sends and receives on, of any
 * type, and (when the plan has room and the role allows) connecting a new
 * WhatsApp number.
 */
import { router } from 'expo-router';
import { Check, ChevronRight, Plus, Radio } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ChannelOnboardingOption } from '@ab-ecosystem/cpaas';

import { ChannelIcon, ChannelStateBadge, useKindLabel } from '@/components/channels/ChannelBits';
import { useSignup } from '@/components/channels/useSignup';
import { Button, Card, Chip, Divider, EmptyState, Loading, Row, Screen, Sheet, Text } from '@/components/ui';
import { useAddChannelBlocker, useChannels, useOnboardingOptions, useRefreshChannels } from '@/hooks/channels';
import { showAlert } from '@/lib/dialog';
import { formatMoney } from '@/lib/money';
import { rtlFlip } from '@/lib/rtl';
import { channelColor, channelIdentity, channelName, channelType, sortKinds, walletBalance, type Channel, type ChannelKind } from '@/services/crm/channels';
import { useDesktop } from '@/hooks/useDesktop';
import { describeCrmError } from '@/services/crm/client';
import { useCan } from '@/stores/auth';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';

function ChannelsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const channels = useChannels();
  const options = useOnboardingOptions();
  const refresh = useRefreshChannels();
  const defaultId = useWhatsAppConfig().channelId;
  const [type, setType] = useState<ChannelKind | 'all'>('all');
  const kindLabel = useKindLabel();
  const desktop = useDesktop();
  const canAdd = useCan('CRM.CHANNEL.WHATSAPP.CREATE');
  const [adding, setAdding] = useState(false);

  const present = useMemo(() => sortKinds((channels.data ?? []).map(channelType)), [channels.data]);
  const shown = (channels.data ?? []).filter((c) => type === 'all' || channelType(c) === type);
  const offers = options.data ?? [];

  return (
    // Desktop reaches this page from the sidebar, so it needs no back button.
    <Screen
      title={t('channels.title')}
      subtitle={t('channels.subtitle')}
      back={!desktop}
      scroll
      onRefresh={refresh}
      maxWidth={1200}
      right={
        // Always here for whoever may connect channels, even when nothing can be added right now (the sheet says why).
        canAdd ? <Button title={t('channels.add')} size="sm" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setAdding(true)} /> : undefined
      }
    >
      <View style={{ gap: 14, marginTop: 8 }}>
        {offers.map((o) => (
          <AddChannelCard key={`${o.type}:${o.slug ?? ''}`} option={o} />
        ))}

        {present.length > 1 ? (
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Chip label={t('common.all')} selected={type === 'all'} onPress={() => setType('all')} />
            {present.map((ty) => (
              <Chip key={ty} label={kindLabel(ty)} selected={type === ty} onPress={() => setType(ty)} />
            ))}
          </Row>
        ) : null}

        {channels.isLoading ? (
          <Loading />
        ) : channels.isError ? (
          <EmptyState
            title={t('common.errorTitle')}
            body={describeCrmError(channels.error)}
            action={t('common.retry')}
            onAction={() => void channels.refetch()}
          />
        ) : !shown.length ? (
          <EmptyState
            icon={<Radio size={28} color={colors.primary} />}
            title={t('channels.emptyTitle')}
            body={offers.length ? t('channels.emptyBody') : t('channels.emptyNoPlan')}
          />
        ) : desktop ? (
          // Desktop: a grid of channel cards.
          <View style={styles.grid}>
            {shown.map((c) => (
              <ChannelTile key={c.id} channel={c} isDefault={channelType(c) === 'whatsapp' && c.id === defaultId} />
            ))}
          </View>
        ) : (
          <Card padded={false}>
            {shown.map((c, i) => {
              const balance = walletBalance(c);
              const isDefault = channelType(c) === 'whatsapp' && c.id === defaultId;
              return (
                <View key={c.id}>
                  <Pressable
                    onPress={() => openChannel(c.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${channelName(c)}, ${kindLabel(channelType(c))}`}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                  >
                    <ChannelIcon type={channelType(c)} color={channelColor(c)} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {channelName(c)}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {[kindLabel(channelType(c)), channelIdentity(c)].filter(Boolean).join(' · ')}
                      </Text>
                      <ChannelMeta channel={c} isDefault={isDefault} balance={balance} />
                    </View>
                    <ChevronRight size={18} color={colors.textFaint} style={rtlFlip()} />
                  </Pressable>
                  {i < shown.length - 1 ? <Divider inset={64} /> : null}
                </View>
              );
            })}
          </Card>
        )}
      </View>
      <AddChannelSheet open={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

const openChannel = (id: string) => router.push({ pathname: '/(app)/channels/[id]', params: { id } });

/** Status, default and balance, under a channel's name. */
function ChannelMeta({ channel: c, isDefault, balance }: { channel: Channel; isDefault: boolean; balance: number | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Row gap={6} style={{ flexWrap: 'wrap' }}>
      <ChannelStateBadge channel={c} />
      {isDefault ? (
        <Row gap={3}>
          <Check size={12} color={colors.primary} />
          <Text variant="micro" tone="primary">
            {t('whatsapp.default')}
          </Text>
        </Row>
      ) : null}
      {balance != null ? (
        <Text variant="micro" tone={balance < 0 ? 'danger' : 'faint'}>
          {t('channels.balance', { amount: formatMoney(balance, c.wallet.currency) })}
        </Text>
      ) : null}
    </Row>
  );
}

/** Desktop: one channel as a card in the grid. */
function ChannelTile({ channel: c, isDefault }: { channel: Channel; isDefault: boolean }) {
  const { colors, radius } = useTheme();
  const kindLabel = useKindLabel();
  return (
    <Pressable
      onPress={() => openChannel(c.id)}
      accessibilityRole="button"
      accessibilityLabel={`${channelName(c)}, ${kindLabel(channelType(c))}`}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        styles.tile,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderColor: hovered ? colors.primary : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Row gap={12}>
        <ChannelIcon type={channelType(c)} color={channelColor(c)} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3" numberOfLines={1}>
            {channelName(c)}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {kindLabel(channelType(c))}
          </Text>
        </View>
      </Row>
      <Text numberOfLines={1}>{channelIdentity(c) || ' '}</Text>
      <ChannelMeta channel={c} isDefault={isDefault} balance={walletBalance(c)} />
    </Pressable>
  );
}

/**
 * Every family this caller can add, or why there is none: the plan, the quota,
 * the role, or a provider that isn't set up yet.
 */
function AddChannelSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const options = useOnboardingOptions();
  const connectable = (options.data ?? []).filter((o) => o.type === 'whatsapp');
  const others = (options.data ?? []).filter((o) => o.type !== 'whatsapp');
  // Nothing on offer: ask the service why (or find it can be connected after all).
  const blocker = useAddChannelBlocker(open && options.isSuccess && !connectable.length);
  const kindLabel = useKindLabel();
  return (
    <Sheet open={open} onClose={onClose} title={t('channels.addTitle')} subtitle={t('channels.addSub')}>
      <View style={{ gap: 12 }}>
        {options.isLoading || blocker.isLoading ? <Loading /> : null}
        {options.isError ? (
          <EmptyState
            title={t('channels.optionsFailed')}
            body={describeCrmError(options.error)}
            action={t('common.retry')}
            onAction={() => void options.refetch()}
          />
        ) : null}
        {connectable.map((o) => (
          <AddChannelCard key={`${o.type}:${o.slug ?? ''}`} option={o} stacked />
        ))}
        {/* The plan list came back empty but a signup link is available: the active provider can still connect one. */}
        {options.isSuccess && !connectable.length && blocker.isSuccess && blocker.data === null ? (
          <AddChannelCard option={{ type: 'whatsapp', label: 'WhatsApp' }} stacked />
        ) : null}
        {blocker.data ? (
          <Card style={{ gap: 6, borderWidth: 1.5, borderColor: colors.warning }}>
            <Text variant="bodyStrong">{t('channels.cantAddTitle')}</Text>
            <Text variant="caption" tone="muted">
              {blocker.data}
            </Text>
          </Card>
        ) : null}
        {others.map((o) => (
          <Row key={o.type} gap={12} style={{ opacity: 0.6 }}>
            <ChannelIcon type={o.type} size={36} />
            <Text style={{ flex: 1 }}>{kindLabel(o.type)}</Text>
          </Row>
        ))}
      </View>
    </Sheet>
  );
}

/** One family the plan lets this caller add, with how many are left. */
/** `stacked`: the narrow layout even on desktop (inside the Add channel dialog). */
function AddChannelCard({ option, stacked }: { option: ChannelOnboardingOption; stacked?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const canCreate = useCan(`CRM.CHANNEL.${option.type.toUpperCase()}.CREATE`);
  const signup = useSignup(option.slug, canCreate);
  const desktop = useDesktop() && !stacked;
  if (!canCreate || option.type !== 'whatsapp') return null;
  const quota =
    option.limit != null ? t('channels.quota', { used: option.used ?? 0, limit: option.limit, remaining: option.remaining ?? 0 }) : t('channels.included');

  const connect = () => {
    if (signup.error) return showAlert(t('channels.cannotConnect'), describeCrmError(signup.error));
    signup.start().catch((err: unknown) => showAlert(t('channels.cannotConnect'), describeCrmError(err)));
  };

  if (desktop)
    return (
      <Card style={{ gap: 8 }}>
        <Row gap={16}>
          <ChannelIcon type="whatsapp" color="#25D366" size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Row gap={10}>
              <Text variant="h3">{t('channels.connectWhatsApp')}</Text>
              <Text variant="caption" tone="muted">
                {quota}
              </Text>
            </Row>
            <Text variant="caption" tone="muted">
              {t('channels.connectBody')}
            </Text>
          </View>
          <Button
            title={t('channels.connect')}
            icon={<Plus size={16} color={colors.onPrimary} />}
            onPress={connect}
            loading={signup.running}
            disabled={!signup.ready && !signup.error}
          />
        </Row>
        {signup.error ? (
          <Text variant="caption" tone="danger">
            {describeCrmError(signup.error)}
          </Text>
        ) : null}
      </Card>
    );

  return (
    <Card style={{ gap: 12 }}>
      <Row gap={12}>
        <ChannelIcon type="whatsapp" color="#25D366" size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3">{t('channels.connectWhatsApp')}</Text>
          <Text variant="caption" tone="muted">
            {quota}
          </Text>
        </View>
      </Row>
      <Text variant="caption" tone="muted">
        {t('channels.connectBody')}
      </Text>
      <Button
        title={t('channels.connect')}
        icon={<Plus size={16} color={colors.onPrimary} />}
        onPress={connect}
        loading={signup.running}
        disabled={!signup.ready && !signup.error}
        full
      />
      {signup.error ? (
        <Text variant="caption" tone="danger">
          {describeCrmError(signup.error)}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  tile: { flexBasis: 300, flexGrow: 1, maxWidth: 380, gap: 12, padding: 18, borderWidth: 1 },
});

/** Members whose role can't open this page get a short explanation instead. */
export default function ChannelsScreenGate() {
  return (
    <RequireCan any={[...P.channelsAny]}>
      <ChannelsScreen />
    </RequireCan>
  );
}
