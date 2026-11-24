import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Pencil } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, Chip, Input, Row, Screen, Sheet, Text } from '@/components/ui';
import { CountryPicker } from '@/components/ui/CountryPicker';
import { countryByCode } from '@/lib/countries';
import { keys } from '@/hooks/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore, useIsOwner, useMyName } from '@/stores/auth';
import { useAccountCountry, useSettingsStore } from '@/stores/settings';
import { useAccountsStore } from '@/stores/accounts';
import type { CountryCode } from 'libphonenumber-js';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const context = useAuthStore((s) => s.context);
  const signOut = useAuthStore((s) => s.signOut);
  const name = useMyName();
  const isOwner = useIsOwner();
  // Per account: each workspace can be in its own country.
  const activeId = useAccountsStore((s) => s.activeId);
  const country = useAccountCountry(activeId);
  const setAccountCountry = useSettingsStore((s) => s.setAccountCountry);
  const setCountry = (c: CountryCode) => (activeId ? setAccountCountry(activeId, c) : useSettingsStore.getState().setCountry(c));
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  // Owners rename themselves here (their SSO login); members' names stay with the web console.
  const updateName = useAuthStore((s) => s.updateName);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const openEdit = () => {
    setFirst(profile?.firstName ?? '');
    setLast(profile?.lastName ?? '');
    setNameError('');
    setEditing(true);
  };
  const saveName = async () => {
    if (saving) return;
    if (!first.trim()) return setNameError(t('profile.nameRequired'));
    setSaving(true);
    setNameError('');
    try {
      await updateName(first, last);
      // Team lists show the new name too.
      void qc.invalidateQueries({ queryKey: keys.team });
      setEditing(false);
    } catch (e) {
      setNameError((e instanceof Error && e.message) || t('common.couldNotSave'));
    } finally {
      setSaving(false);
    }
  };
  const { colors, radius } = useTheme();
  const current = countryByCode(country);

  return (
    <Screen title={t('settings.profile')} back scroll>
      <View style={{ gap: 14, marginTop: 8 }}>
        <Card style={{ alignItems: 'center', gap: 8 }}>
          <Avatar name={name} uri={profile?.avatarUrl} size={72} />
          {isOwner ? (
            <Pressable
              onPress={openEdit}
              accessibilityRole="button"
              accessibilityLabel={t('profile.editName')}
              hitSlop={8}
              style={({ pressed }) => [styles.nameRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text variant="h2">{name}</Text>
              <Pencil size={16} color={colors.textMuted} />
            </Pressable>
          ) : (
            <Text variant="h2">{name}</Text>
          )}
          <Text tone="muted">{profile?.email}</Text>
          <Row gap={6}>
            <Chip label={context?.accountName || t('more.myWorkspace')} tone="primary" small />
            <Chip label={isOwner ? t('common.owner') : context?.role?.title || t('common.member')} small />
          </Row>
          <Text variant="micro" tone="faint">
            {isOwner
              ? t('profile.editHintOwner')
              : t('profile.editHint', { defaultValue: 'Edit your name, password and 2FA from the web console.' })}
          </Text>
        </Card>
        <Card style={{ gap: 8 }}>
          <Text variant="h3">{t('profile.countryTitle', { defaultValue: 'Default country for numbers' })}</Text>
          <Text variant="caption" tone="muted">
            {t('profile.countryBody', { defaultValue: 'Numbers typed without a country code are read in this region.' })}
          </Text>
          <Pressable
            onPress={() => setPicking(true)}
            style={({ pressed }) => [styles.select, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={{ fontSize: 24 }}>{current?.flag ?? '🌐'}</Text>
            <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
              {current ? current.name : country}
            </Text>
            <Text variant="bodyStrong" tone="muted">
              {current ? `+${current.dial}` : ''}
            </Text>
            <ChevronDown size={18} color={colors.textMuted} />
          </Pressable>
          <CountryPicker
            open={picking}
            value={current}
            title={t('auth.countryCode')}
            onClose={() => setPicking(false)}
            onSelect={(c) => {
              setCountry(c.code);
              setPicking(false);
            }}
          />
        </Card>
        <Sheet
          open={editing}
          onClose={() => setEditing(false)}
          locked={saving}
          title={t('profile.editName')}
          footer={<Button title={t('common.save')} loading={saving} onPress={() => void saveName()} />}
        >
          <View style={{ gap: 12 }}>
            <Input label={t('auth.firstName')} value={first} onChangeText={setFirst} autoFocus autoComplete="given-name" textContentType="givenName" />
            <Input
              label={t('auth.lastName')}
              value={last}
              onChangeText={setLast}
              autoComplete="family-name"
              textContentType="familyName"
              returnKeyType="done"
              onSubmitEditing={() => void saveName()}
            />
            {nameError ? (
              <Text variant="caption" tone="danger">
                {nameError}
              </Text>
            ) : null}
          </View>
        </Sheet>
        <Button
          title={t('auth.signOut')}
          variant="danger"
          loading={busy}
          onPress={() => {
            setBusy(true);
            void signOut();
          }}
          style={{ alignSelf: 'center' }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, height: 54 },
});
