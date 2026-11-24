/**
 * Manage accounts. Every signed-in account stays active (its inbox stays
 * connected). Per account: colour, switch, sign out.
 */
import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { Check, LogOut, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AccountBadge } from '@/components/accounts/AccountSwitcher';
import { Button, Card, Row, Screen, Text } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/dialog';
import { ACCOUNT_COLORS, useAccountsStore, type AccountSession } from '@/stores/accounts';
import { useAuthStore } from '@/stores/auth';
import { useWhatsAppStore } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';

export default function AccountsSettings() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const sessions = useAccountsStore((s) => s.sessions);
  const activeId = useAccountsStore((s) => s.activeId);
  const beginAddAccount = useAuthStore((s) => s.beginAddAccount);
  const android = Platform.OS === 'android';

  return (
    <Screen title={t('accounts.manage')} subtitle={t('accounts.manageSub')} back scroll>
      <View style={{ gap: 14, marginTop: 8 }}>
        {sessions.map((s) => (
          <AccountCard key={s.id} session={s} active={s.id === activeId} />
        ))}
        <Button
          title={t('accounts.add')}
          variant="secondary"
          icon={<Plus size={18} color={colors.primary} />}
          onPress={() => {
            beginAddAccount();
            router.push('/(auth)/access');
          }}
        />
        <Text variant="caption" tone="faint" center style={{ paddingHorizontal: 12 }}>
          {android ? t('accounts.backgroundNote') : t('accounts.webNote')}
        </Text>
      </View>
    </Screen>
  );
}

function AccountCard({ session, active }: { session: AccountSession; active: boolean }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const setColor = useAccountsStore((s) => s.setColor);
  const switchSession = useAuthStore((s) => s.switchSession);
  const signOut = useAuthStore((s) => s.signOut);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    const ok = await confirmAction({
      title: t('accounts.signOutTitle', { name: session.workspaceName }),
      message: t('accounts.signOutBody'),
      confirmText: t('auth.signOut'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await signOut(session.id);
      useWhatsAppStore.getState().forget(session.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={[{ gap: 14 }, active && { borderWidth: 2, borderColor: session.color }]}>
      <Row gap={12}>
        <AccountBadge session={session} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3" numberOfLines={1}>
            {session.workspaceName}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {session.email}
            {session.roleTitle ? ` · ${session.roleTitle}` : session.isOwner ? ` · ${t('common.owner')}` : ''}
          </Text>
        </View>
        {active ? (
          <View style={[styles.activeTag, { backgroundColor: session.color }]}>
            <Check size={12} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{t('accounts.onScreen')}</Text>
          </View>
        ) : null}
      </Row>

      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="muted">
          {t('accounts.color')}
        </Text>
        <Text variant="micro" tone="faint">
          {t('accounts.colorHint')}
        </Text>
        <View style={styles.swatches}>
          {ACCOUNT_COLORS.map((c) => (
            <Pressable
              key={c}
              accessibilityLabel={c}
              onPress={() => setColor(session.id, c)}
              style={[styles.swatch, { backgroundColor: c, borderRadius: radius.sm, borderColor: session.color === c ? colors.text : 'transparent' }]}
            >
              {session.color === c ? <Check size={14} color="#fff" /> : null}
            </Pressable>
          ))}
        </View>
      </View>

      <Row gap={10}>
        {!active ? (
          <Button
            title={t('accounts.switchTo')}
            size="sm"
            style={{ flex: 1 }}
            onPress={() =>
              void switchSession(session.id)
                .then(() => goBack())
                .catch((e: unknown) => showAlert(t('accounts.couldNotSwitch'), e instanceof Error ? e.message : ''))
            }
          />
        ) : null}
        <Button
          title={t('auth.signOut')}
          size="sm"
          variant="ghost"
          loading={busy}
          icon={<LogOut size={14} color={colors.danger} />}
          style={{ flex: active ? 1 : undefined }}
          onPress={() => void remove()}
        />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  activeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
