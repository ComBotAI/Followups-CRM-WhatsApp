/**
 * WhatsApp settings for the active account.
 *
 * Phone mode: the WhatsApp button opens WhatsApp on this phone.
 * API mode: pick the account's WhatsApp Business channel from CPaaS, then
 * manage its templates (sync from Meta, preview, create, delete). Sends from
 * a lead then use approved templates with variables filled from the lead.
 */
import { router } from 'expo-router';
import { Check, ChevronRight, Lock, MessageCircle, Radio, Repeat, Server, Smartphone } from 'lucide-react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Card, Group, GroupRow, Screen, Text } from '@/components/ui';
import { useWaChannels } from '@/hooks/queries';
import { describeCrmError } from '@/services/crm/client';
import { useAccountsStore } from '@/stores/accounts';
import { useWhatsAppConfig, useWhatsAppStore, type WhatsAppMode } from '@/stores/whatsapp';
import { isWorkspaceLocked } from '@/services/cloudSettings';
import { useTheme } from '@/theme/ThemeProvider';
import { formatPhone } from '@/lib/phone';
import { rtlFlip } from '@/lib/rtl';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';

function WhatsAppSettings() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const accountId = useAccountsStore((s) => s.activeId);
  const config = useWhatsAppConfig();
  const setConfig = useWhatsAppStore((s) => s.set);
  const api = config.mode === 'api';
  const channels = useWaChannels(api);

  // Set for the whole team in the cloud: only owners change it.
  const locked = isWorkspaceLocked('whatsapp', accountId);
  const choose = (mode: WhatsAppMode) => accountId && !locked && setConfig(accountId, { mode });

  // Pick the only channel automatically.
  const only = channels.data?.length === 1 ? channels.data[0] : null;
  useEffect(() => {
    if (api && only && !config.channelId && accountId && !locked) setConfig(accountId, { channelId: only.id, channelName: only.name });
  }, [api, only, config.channelId, accountId, setConfig, locked]);

  return (
    <Screen title={t('whatsapp.settings')} subtitle={t('whatsapp.settingsSub')} back scroll onRefresh={() => channels.refetch()}>
      <View style={{ gap: 14, marginTop: 8 }}>
        {locked ? (
          <Card style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Lock size={16} color={colors.textMuted} />
            <Text variant="caption" tone="muted" style={{ flex: 1 }}>
              {t('cloud.locked')}
            </Text>
          </Card>
        ) : null}
        <ModeCard
          on={!api}
          icon={<Smartphone size={22} color={!api ? '#fff' : colors.textMuted} />}
          title={t('whatsapp.modePhone')}
          body={t('whatsapp.modePhoneBody')}
          onPress={() => choose('phone')}
        />
        <ModeCard
          on={api}
          icon={<Server size={22} color={api ? '#fff' : colors.textMuted} />}
          title={t('whatsapp.modeApi')}
          body={t('whatsapp.modeApiBody')}
          onPress={() => choose('api')}
        />

        {api ? (
          <>
            <Text variant="micro" tone="faint" style={{ marginStart: 4, marginTop: 6 }}>
              {t('whatsapp.channel').toUpperCase()}
            </Text>
            <Card padded={false}>
              {channels.isLoading ? <ActivityIndicator style={{ padding: 20 }} color={colors.primary} /> : null}
              {channels.error ? (
                <Text tone="danger" style={{ padding: 14 }}>
                  {describeCrmError(channels.error)}
                </Text>
              ) : null}
              {channels.data && !channels.data.length ? (
                <Text tone="muted" style={{ padding: 14 }}>
                  {t('whatsapp.noChannels')}
                </Text>
              ) : null}
              {(channels.data ?? []).map((c, i, arr) => {
                const on = config.channelId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => router.push({ pathname: '/(app)/channels/[id]', params: { id: c.id } })}
                    style={({ pressed }) => [
                      styles.channel,
                      pressed && { backgroundColor: colors.surfaceAlt },
                      i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={[styles.chIcon, { backgroundColor: c.color }]}>
                      <MessageCircle size={18} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{c.name}</Text>
                      <Text variant="caption" tone="muted">
                        {c.number ? formatPhone(c.number.replace(/^\+/, '')) : ''}
                        {!c.active ? ` · ${t('whatsapp.inactive')}` : ''}
                      </Text>
                    </View>
                    {on ? (
                      <View style={[styles.defaultTag, { backgroundColor: colors.primarySoft }]}>
                        <Check size={12} color={colors.primary} />
                        <Text variant="micro" style={{ color: colors.primary, letterSpacing: 0 }}>
                          {t('whatsapp.default')}
                        </Text>
                      </View>
                    ) : (
                      <Pressable hitSlop={8} onPress={() => accountId && !locked && setConfig(accountId, { channelId: c.id, channelName: c.name })}>
                        <Text variant="caption" tone="primary" style={{ fontWeight: '600' }}>
                          {t('whatsapp.makeDefault')}
                        </Text>
                      </Pressable>
                    )}
                    <ChevronRight size={18} color={colors.textFaint} style={rtlFlip()} />
                  </Pressable>
                );
              })}
            </Card>

            <Group>
              <GroupRow
                icon={<Radio size={18} color={colors.primary} />}
                tint={colors.primary}
                title={t('channels.manage')}
                subtitle={t('channels.manageSub')}
                onPress={() => router.push('/(app)/channels')}
              />
              <GroupRow
                last
                icon={<Repeat size={18} color={colors.accent} />}
                tint={colors.accent}
                title={t('followup.title')}
                subtitle={t('followup.sub')}
                onPress={() => router.push('/(app)/followups')}
              />
            </Group>

            <Text variant="caption" tone="faint" style={{ paddingHorizontal: 4 }}>
              {t('whatsapp.channelsHint')}
            </Text>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function ModeCard({ on, icon, title, body, onPress }: { on: boolean; icon: React.ReactNode; title: string; body: string; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.mode,
        {
          borderRadius: radius.lg,
          borderColor: on ? colors.primary : colors.border,
          backgroundColor: on ? colors.primarySoft : colors.surface,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.modeIcon, { backgroundColor: on ? colors.primary : colors.surfaceAlt }]}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="h3">{title}</Text>
        <Text variant="caption" tone="muted">
          {body}
        </Text>
      </View>
      <View style={[styles.radio, { borderColor: on ? colors.primary : colors.borderStrong }]}>
        {on ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mode: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1.5 },
  modeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  channel: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  chIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  defaultTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
});

/** Members whose role doesn't include it get a "not allowed" page (see `P.app`). */
export default function WhatsAppSettingsRoute() {
  return (
    <RequireCan all={[P.app.workspaceSettings]}>
      <WhatsAppSettings />
    </RequireCan>
  );
}
