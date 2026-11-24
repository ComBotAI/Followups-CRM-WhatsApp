import '@/polyfills';
// Importing this module registers the background sync task at load (required for headless starts).
import { registerBackgroundSync, unregisterBackgroundSync } from '@/services/background';

import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { addContactsChangeListener } from 'expo-contacts';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Text as RNText, View, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { DialogHost } from '@/components/ui/DialogHost';
import { BootSplash } from '@/components/BootSplash';
import { PUBLIC_PAGES, titleForPath } from '@/lib/seo';
import { env, missingEnv } from '@/config/env';
import { applyLanguage, initI18n } from '@/i18n';
import { setDefaultCountry } from '@/lib/phone';
import { ensureDataStore } from '@/services/crm/datastore';
import { restoreContacts, saveContactsFrom } from '@/services/crm/contactsCache';
import { retryPendingRecords } from '@/services/crm/records';
import { rearmTaskNotifications } from '@/services/crm/waTasks';
import { startCloudSettings } from '@/services/cloudSettings';
import { autoAddNewContacts } from '@/services/contactsSync';
import { configureNotifications, registerPushDevice } from '@/services/notifications';
import { startTabSync } from '@/services/tabSync';
import { activeAccountId, onActiveAccountChange, tokenFor, useAccountsStore } from '@/stores/accounts';
import { useContactPanel } from '@/stores/contactPanel';
import { useAuthStore } from '@/stores/auth';
import { useAccountCountry, useSettingsStore } from '@/stores/settings';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Language must be ready before the first render so no screen flashes English.
initI18n(useSettingsStore.getState().language);
void applyLanguage(useSettingsStore.getState().language);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, gcTime: 24 * 3600_000, refetchOnReconnect: true },
  },
});

// Refetch stale queries when the app returns to the foreground.
AppState.addEventListener('change', (state: AppStateStatus) => {
  focusManager.setFocused(state === 'active');
});

// Each account has its own data: drop every cached query when the active one changes.
onActiveAccountChange(() => {
  queryClient.clear();
  // That account's saved contact lists show while they refresh.
  void restoreContacts(queryClient, activeAccountId());
  // A contact open in the desktop side panel belongs to the account we just left.
  useContactPanel.getState().close();
  // Visits: that account's yearly wishes (once a day per account).
  void import('@/services/crm/services').then((m) => m.sweepOccasions()).catch(() => undefined);
});

// Back online: upload whatever was saved offline.
// (Not during the web server render, which has no `window`.)
let wasOffline = false;
/** Sign-in setup already done this run: accounts whose schema and store were checked, push registrations, notification channels. */
const bootstrapped = new Set<string>();
const pushRegistered = new Set<string>();
let notificationsConfigured = false;
if (typeof window !== 'undefined')
  Network.addNetworkStateListener((st) => {
    const online = !!st.isConnected && st.isInternetReachable !== false;
    if (!online) {
      wasOffline = true;
      return;
    }
    if (!wasOffline || useAuthStore.getState().status !== 'signedIn') return;
    wasOffline = false;
    void retryPendingRecords();
  });

// Contact lists: saved on the device, back on screen at once next time.
saveContactsFrom(queryClient, activeAccountId);
void restoreContacts(queryClient, activeAccountId());

let pendingTap: Notifications.NotificationResponse | null = null;
/** Each notification opens once, whichever way its tap arrived. */
const tapsOpened = new Set<string>();

const openTapped = (r: Notifications.NotificationResponse) => {
  if (tapsOpened.has(r.notification.request.identifier)) return;
  tapsOpened.add(r.notification.request.identifier);
  // Our own notifications carry `url`; CPaaS message pushes carry the contact (chat) id as `chat`,
  // which opens that lead (there is no in-app inbox).
  const data = r.notification.request.content.data as
    | { url?: string; accountId?: string; waUrl?: string; chat?: string }
    | undefined;
  if (data?.waUrl) {
    void Linking.openURL(data.waUrl).catch(() => undefined);
    return;
  }
  const lead = data?.url?.match(/lead\/([^/?#]+)/)?.[1] ?? data?.url?.match(/chat\/([^/?#]+)/)?.[1] ?? data?.chat;
  const waTasks = /wa-tasks/.test(data?.url ?? '');
  if (!lead && !waTasks) return;
  void (async () => {
    // Open it in the account it belongs to; give up rather than open it in the wrong one.
    if (data?.accountId && data.accountId !== useAccountsStore.getState().activeId) {
      const switched = await useAuthStore
        .getState()
        .switchSession(data.accountId)
        .then(
          () => true,
          () => false,
        );
      if (!switched) return;
    }
    if (waTasks) router.push('/(app)/wa-tasks');
    else if (lead) router.push({ pathname: '/lead/[id]', params: { id: lead } });
  })();
};

/** Any render error below the root shows here instead of a blank or closed app. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 80, gap: 12, backgroundColor: '#FFFFFF' }}>
      <RNText style={{ fontSize: 20, fontWeight: '700', color: '#0E0E11' }}>Something went wrong</RNText>
      <RNText selectable style={{ fontSize: 13, color: '#5F5F6B' }}>
        {`${error.name}: ${error.message}\n\n${(error.stack ?? '').split('\n').slice(0, 10).join('\n')}`}
      </RNText>
      <RNText onPress={() => void retry()} style={{ fontSize: 16, fontWeight: '600', color: '#2450DB', marginTop: 12 }}>
        Try again
      </RNText>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <Root />
            </ThemeProvider>
          </QueryClientProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const { colors, scheme } = useTheme();
  const [fontsReady, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  const fontsDone = fontsReady || !!fontError;
  const status = useAuthStore((s) => s.status);
  const activeId = useAccountsStore((s) => s.activeId);
  const boot = useAuthStore((s) => s.boot);
  // Numbers typed without a country code use the active account's country.
  const country = useAccountCountry(activeId);
  const language = useSettingsStore((s) => s.language);
  const [envProblem] = useState(() => missingEnv());
  const pathname = usePathname();

  // Web: the browser tab follows the page as the app navigates (static HTML only covers the
  // first page). Public pages, and anything while signed out, get the public title; the
  // signed-in sections name themselves (see the (app) web layout).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (status === 'signedIn' && !(pathname in PUBLIC_PAGES)) return;
    document.title = titleForPath(pathname);
  }, [pathname, status]);

  useEffect(() => {
    setDefaultCountry(country);
  }, [country]);

  useEffect(() => {
    initI18n(language);
  }, [language]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // New phone contacts → CRM while the app runs (only for accounts with auto-add on).
  useEffect(() => {
    // Phones only: browsers can't read contacts.
    if (Platform.OS === 'web' || status !== 'signedIn') return;
    const sub = addContactsChangeListener(() => void autoAddNewContacts().catch(() => 0));
    return () => sub.remove();
  }, [status]);

  // Tapping a notification opens its chat, lead or task list, in its own account. A tap that
  // started the app waits until sign-in has finished (the app's screens aren't there before).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      if (useAuthStore.getState().status === 'signedIn') openTapped(r);
      else pendingTap = r;
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web' || status !== 'signedIn') return;
    // Launched by a tap from a closed app: the listener above can miss it, the last response has it.
    const r = pendingTap ?? Notifications.getLastNotificationResponse();
    pendingTap = null;
    if (r) {
      Notifications.clearLastNotificationResponse();
      openTapped(r);
    }
  }, [status]);

  useEffect(() => {
    // The native splash (one colour) hands over to the animated BootSplash straight away.
    SplashScreen.hideAsync().catch(() => undefined);
    if (status === 'signedOut') void unregisterBackgroundSync();
  }, [status, fontsDone]);

  // Post-sign-in bootstrap: data store lookup, notifications, background contact sync.
  useEffect(() => {
    if (status !== 'signedIn') return;
    let cancelled = false;
    (async () => {
      // Once per account per run: switching back and forth must not redo the schema and store checks.
      const acct = activeId ?? '';
      if (!notificationsConfigured) {
        notificationsConfigured = true;
        await configureNotifications().catch(() => undefined);
      }
      if (!bootstrapped.has(acct)) {
        // Only looks the data store up: fields and the store are created from Workspace setup, never on sign-in.
        // Marked done only when it went through, so an offline start tries again on the next switch / start.
        const storeOk = await ensureDataStore().then(() => true, () => false);
        if (storeOk) bootstrapped.add(acct);
      }
      if (cancelled) return;
      if (Platform.OS === 'android') void registerBackgroundSync();
      // Push: only when an account signed in this run hasn't been registered yet (it registers every signed-in account).
      const signedIn = useAccountsStore.getState().sessions.filter((x) => !!tokenFor(x.id)).map((x) => x.id);
      if (signedIn.some((id) => !pushRegistered.has(id))) {
        signedIn.forEach((id) => pushRegistered.add(id));
        void registerPushDevice();
      }
      void retryPendingRecords();
      startCloudSettings();
      startTabSync();
      void rearmTaskNotifications().catch(() => undefined);
      // Reminder alarms for reminders made on another phone or before a reinstall.
      void import('@/services/reminders').then((m) => m.rearmReminderNotifications()).catch(() => undefined);
      // Visits: next year's birthday / anniversary wishes for guests whose last ones went out (once a day, every account).
      void import('@/services/crm/services').then((m) => m.sweepAllOccasions()).catch(() => undefined);
      if (Platform.OS !== 'web') void autoAddNewContacts().catch(() => 0);
    })();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void retryPendingRecords();
      }
      if (s === 'active' && Platform.OS !== 'web') void autoAddNewContacts().catch(() => 0);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [status, activeId]);

  if (envProblem.length) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 8,
        }}
      >
        <Text variant="h2">Configuration needed</Text>
        <Text tone="muted" center>
          Set these in .env (see .env.example) and restart:
        </Text>
        {envProblem.map((m) => (
          <Text key={m.key} variant="mono" tone="danger">
            {m.key}
          </Text>
        ))}
        <Text variant="caption" tone="faint" center style={{ marginTop: 12 }}>
          SSO: {env.ssoUrl || '—'} · CPaaS: {env.cpassBaseUrl || '—'}
        </Text>
      </View>
    );
  }

  const booting = !fontsDone || status === 'booting';

  // Sign-in routing lives in the (app) and (auth) group layouts: a redirect
  // from here can fire before the navigator mounts, which Android ignores.

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
      <DialogHost />
      <BootSplash visible={booting} />
    </>
  );
}
