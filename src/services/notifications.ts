/**
 * Local reminder notifications + push registration with the CPaaS
 * notifications resource. The FCM token comes from services/pushToken, one file
 * per platform; when it can't be had (no Firebase config, no VAPID key on web)
 * registration is skipped quietly.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { env } from '@/config/env';
import { crmFor } from '@/services/crm/client';
import { reminderKind, type Reminder } from '@/services/crm/records';
import { getPushToken } from '@/services/pushToken';
import { tokenFor, useAccountsStore } from '@/stores/accounts';

export const REMINDER_CHANNEL = 'reminders';

let configured = false;

export const configureNotifications = async () => {
  if (configured) return;
  configured = true;
  // Only called while the app is in the foreground. CPaaS pushes (new WhatsApp
  // messages) stay silent then, the open app already shows them; local
  // reminders still alert.
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const trigger = notification.request.trigger as { type?: string } | null;
      const show = trigger?.type !== 'push';
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: 'Reminders',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2F5BEA',
    });
  }
};

export const hasNotificationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  return (await Notifications.getPermissionsAsync()).granted;
};

export const ensureNotificationPermission = async (): Promise<boolean> => {
  // expo-notifications has no permissions module on web.
  if (Platform.OS === 'web') {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'default') await Notification.requestPermission();
    return Notification.permission === 'granted';
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
};

/**
 * Schedules a reminder's alarm; null when it can't ring (past, no permission, or web, where
 * expo-notifications has no scheduler and would throw). Never throws.
 */
export const scheduleReminderNotification = async (reminder: Reminder): Promise<string | null> => {
  if (Platform.OS === 'web') return null;
  const due = new Date(reminder.due_at);
  if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) return null;
  if (!(await ensureNotificationPermission().catch(() => false))) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `${{ call: 'Call ', whatsapp: 'WhatsApp ', task: '' }[reminderKind(reminder)]}${reminder.contact_name || reminder.phone || 'Reminder'}`,
      body: reminder.note || 'Follow-up reminder',
      data: {
        kind: 'reminder',
        reminderId: reminder.id,
        // What it was armed for: a re-arm moves it when the reminder was rescheduled elsewhere.
        dueAt: reminder.due_at,
        contactId: reminder.contact_id,
        phone: reminder.phone,
        // A tap opens the lead, in the account the reminder belongs to.
        url: reminder.contact_id ? `${env.appScheme}://lead/${reminder.contact_id}` : undefined,
        accountId: useAccountsStore.getState().activeId ?? undefined,
      },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: due,
      channelId: REMINDER_CHANNEL,
    },
  }).catch(() => null);
};

export const cancelReminderNotification = async (notificationId?: string) => {
  if (!notificationId || Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => undefined);
};

/** The reminder alarms armed on this phone for one account: notification id → the due time it was armed for. */
export const armedReminderNotifications = async (accountId: string | null): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  if (Platform.OS === 'web') return out;
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const n of all) {
    const data = n.content.data as { kind?: string; accountId?: string; dueAt?: string } | undefined;
    if (data?.kind === 'reminder' && (data.accountId ?? null) === (accountId ?? null)) out.set(n.identifier, data.dueAt ?? '');
  }
  return out;
};

const registered = new Set<string>();
/** Whether this device is subscribed for this account's CPaaS push, so its inbox messages need no local alert. */
export const pushRegistered = (accountId: string) => registered.has(accountId);

/**
 * Registers this device for CPaaS push (incoming WhatsApp messages; a tap opens the lead). Best effort. On web the
 * browser prompt is only shown when `ask` is set (from a button press): Safari
 * ignores prompts that don't come from a user gesture.
 */
export const registerPushDevice = async ({ ask = Platform.OS !== 'web' } = {}): Promise<void> => {
  let token: string | null = null;
  try {
    if (ask ? !(await ensureNotificationPermission()) : !(await hasNotificationPermission())) return;
    token = await getPushToken();
  } catch {
    return; // No Firebase config: skip quietly.
  }
  if (!token || token.length < 20) return;
  // Every signed-in account: each one's inbox can deliver in the background.
  const ids = useAccountsStore.getState().sessions.map((x) => x.id).filter((id) => !!tokenFor(id));
  await Promise.all(
    ids.map((id) =>
      crmFor(id)
        .notifications.subscribe({
          token: token!,
          platform: Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : 'android',
          device_label: `${env.appName} on ${Platform.OS}`,
        })
        .then(() => void registered.add(id))
        // Push not enabled on that account: its inbox falls back to local alerts.
        .catch(() => undefined),
    ),
  );
};

/** Signing out: this device stops getting the account's pushes. Best effort, capped. */
export const unregisterPushDevice = async (accountId: string): Promise<void> => {
  registered.delete(accountId);
  const work = (async () => {
    const token = await getPushToken();
    if (token) await crmFor(accountId).notifications.unsubscribe(token);
  })();
  await Promise.race([work, new Promise((r) => setTimeout(r, 4000))]).catch(() => undefined);
};

/** Cancels every scheduled notification of an account (reminders, WhatsApp tasks…), e.g. on sign-out. */
export const cancelAccountNotifications = async (accountId: string): Promise<void> => {
  if (Platform.OS === 'web') return;
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    all
      .filter((n) => (n.content.data as { accountId?: string } | undefined)?.accountId === accountId)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined)),
  );
};
