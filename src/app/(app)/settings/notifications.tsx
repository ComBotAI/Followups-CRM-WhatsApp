import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, Smartphone } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Row, Screen, Text } from '@/components/ui';
import { crm } from '@/services/crm/client';
import { ensureNotificationPermission, hasNotificationPermission, registerPushDevice } from '@/services/notifications';
import { showAlert } from '@/lib/dialog';
import { useTheme } from '@/theme/ThemeProvider';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [granted, setGranted] = useState<boolean | null>(null);
  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: () => crm().notifications.devices({ rows: 20 }),
    retry: false,
  });

  useEffect(() => {
    hasNotificationPermission()
      .then(setGranted)
      .catch(() => setGranted(false));
  }, []);

  return (
    <Screen title={t('settings.notifications')} back scroll>
      <View style={{ gap: 14, marginTop: 8 }}>
        <Card style={{ gap: 8 }}>
          <Row gap={8}>
            <Bell size={18} color={colors.warning} />
            <Text variant="h3">{t('notif.remindersTitle', { defaultValue: 'Follow-up reminders' })}</Text>
          </Row>
          <Text variant="caption" tone="muted">
            {granted
              ? t('notif.remindersOn', { defaultValue: 'Enabled. Reminders ring at the time you set, even when the app is closed.' })
              : t('notif.remindersOff', { defaultValue: 'Allow notifications so follow-up reminders can reach you.' })}
          </Text>
          {granted === false ? (
            <Button
              title={t('notif.allow', { defaultValue: 'Allow notifications' })}
              onPress={() =>
                void ensureNotificationPermission()
                  .then(setGranted)
                  .catch((e: unknown) => showAlert(t('common.errorTitle'), e instanceof Error ? e.message : ''))
              }
            />
          ) : null}
        </Card>
        <Card style={{ gap: 8 }}>
          <Row gap={8}>
            <Smartphone size={18} color={colors.primary} />
            <Text variant="h3">{t('notif.waTitle', { defaultValue: 'New WhatsApp messages' })}</Text>
          </Row>
          <Text variant="caption" tone="muted">
            {t('notif.waBody', { defaultValue: "When a lead replies on a connected WhatsApp channel, the assigned member's devices are notified." })}
          </Text>
          {devices.isError ? (
            <Text variant="caption" tone="warning">
              {t('notif.pushMissing', { defaultValue: 'Push is not configured on this workspace yet.' })}
            </Text>
          ) : (
            (devices.data?.data ?? []).map((d) => (
              <Text key={d.id} variant="caption">
                {t('notif.device', {
                  defaultValue: '{{label}} · {{platform}} · seen {{when}}',
                  label: d.label || t('notif.thisDevice', { defaultValue: 'This device' }),
                  platform: d.platform,
                  when: d.lastSeenAt && !Number.isNaN(new Date(d.lastSeenAt).getTime()) ? new Date(d.lastSeenAt).toLocaleDateString() : '—',
                })}
              </Text>
            ))
          )}
          <Button
            title={t('notif.register', { defaultValue: 'Register this device' })}
            variant="secondary"
            onPress={() =>
              void registerPushDevice({ ask: true })
                .then(() => devices.refetch())
                .catch((e: unknown) => showAlert(t('common.errorTitle'), e instanceof Error ? e.message : ''))
            }
          />
        </Card>
      </View>
    </Screen>
  );
}
