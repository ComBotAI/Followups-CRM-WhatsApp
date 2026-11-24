/**
 * Web shell around every signed-in page.
 *
 * Desktop (≥ 900 px): a light sidebar with the account switcher, search, the
 * work sections and follow-ups, and settings + profile at the bottom;
 * contacts open in a panel that slides in from the right. Narrow windows get
 * the phone-style bottom strip. `flexDirection: 'row'` mirrors under RTL.
 */
import { Redirect, Stack, usePathname, useRouter, type Href } from 'expo-router';
import {
  AlarmClock,
  ChartColumn,
  Columns3,
  Ellipsis,
  ListTodo,
  Megaphone,
  Radio,
  Repeat,
  Search,
  Send,
  Settings,
  Store,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect } from 'react';

import { SidebarRootsContext } from '@/components/ui/Screen';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AccountPill } from '@/components/accounts/AccountSwitcher';
import { BrandLogo } from '@/components/Brand';
import { ContactPanel } from '@/components/leads/ContactPanel';
import { HIDDEN } from '@/components/navigation/FloatingTabBar';
import { WorkspaceSetupGate } from '@/hooks/useWorkspaceSetup';
import { Avatar, Text } from '@/components/ui';
import { useDesktop } from '@/hooks/useDesktop';
import { useAccountFromLink, useAppGuard, useEndAddingOutsideAuth, useFeatureRedirect } from '@/lib/authGuard';
import { useAuthStore, useCan, useCanAny, useMyName } from '@/stores/auth';
import { env } from '@/config/env';
import { P } from '@/lib/permissions';
import { useFeatures } from '@/stores/features';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';

type Item = { href: Href; match: string[]; label: string; Icon: LucideIcon; show: boolean };

const isActive = (path: string, match: string[]) => match.some((m) => (m === '/' ? path === '/' : path === m || path.startsWith(`${m}/`)));

export default function AppLayoutWeb() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const wide = useDesktop();
  const pathname = usePathname();
  const router = useRouter();
  const api = useWhatsAppConfig().mode === 'api';
  const features = useFeatures();
  // A member sees the sections their role can open.
  const can = {
    contacts: useCan(P.contacts.list),
    campaigns: useCan(P.campaigns.list),
    channels: useCanAny([...P.channelsAny]),
    services: useCan(P.app.services),
    reports: useCan(P.app.reports),
  };
  const name = useMyName();
  const profile = useAuthStore((s) => s.profile);
  const guard = useAppGuard();
  const featureRedirect = useFeatureRedirect();
  useEndAddingOutsideAuth();
  useAccountFromLink();

  const work: Item[] = [
    { href: '/(app)/visits', match: ['/visits'], label: t('visits.title'), Icon: Store, show: features.services && can.contacts },
    { href: '/(app)/reports', match: ['/reports'], label: t('reports.title'), Icon: ChartColumn, show: features.services && can.reports },
    {
      href: '/(app)/(tabs)/contacts',
      match: ['/contacts', '/lead', '/import', '/trash'],
      label: t('tabs.leads'),
      Icon: Users,
      show: features.crm && can.contacts,
    },
    { href: '/(app)/(tabs)/board', match: ['/board'], label: t('tabs.board'), Icon: Columns3, show: features.crm && can.contacts },
    { href: '/(app)/channels', match: ['/channels'], label: t('channels.title'), Icon: Radio, show: api && can.channels },
  ];
  const followUps: Item[] = [
    { href: '/(app)/today', match: ['/today'], label: t('today.title'), Icon: ListTodo, show: features.crm && can.contacts },
    { href: '/(app)/reminders', match: ['/reminders'], label: t('more.reminders'), Icon: AlarmClock, show: features.crm },
    { href: '/(app)/wa-tasks', match: ['/wa-tasks'], label: t('waTasks.title'), Icon: Send, show: features.followups && !api },
    { href: '/(app)/followups', match: ['/followups'], label: t('followup.title'), Icon: Repeat, show: features.followups },
    { href: '/(app)/settings/services', match: ['/settings/services'], label: t('services.title'), Icon: Sparkles, show: features.services && can.services },
    // Broadcasts need approved templates: Cloud API only.
    { href: '/(app)/campaigns', match: ['/campaigns'], label: t('tabs.campaigns'), Icon: Megaphone, show: features.crm && api && can.campaigns },
  ];
  // Phone-sized windows reach the follow-up tools through one Follow-ups tab, as in the app.
  const hub: Item = {
    href: '/(app)/follow-ups',
    match: ['/follow-ups', '/reminders', '/wa-tasks', '/followups', '/campaigns'],
    label: t('more.followUps'),
    Icon: Repeat,
    show: features.crm && can.contacts,
  };
  const settings: Item = {
    // Wide windows open the settings layout directly; the bottom strip's More page stays the phone way in.
    href: wide ? '/(app)/settings/profile' : '/(app)/(tabs)/more',
    match: ['/more', '/settings', '/sync'],
    label: t('more.settings'),
    Icon: Settings,
    show: true,
  };

  // The browser tab names the section you are in.
  const section = [...work, ...followUps].find((i) => i.show && isActive(pathname, i.match)) ?? (isActive(pathname, settings.match) ? settings : null);
  const sectionLabel = section?.label;
  // Only once someone is signed in: a signed-out visit passes through here on its way to
  // sign-in, and must not leave "Visits · …" in the tab (the root layout titles that page).
  const showing = guard.ready && !guard.redirect && !featureRedirect;
  useEffect(() => {
    if (!showing || typeof document === 'undefined') return;
    document.title = sectionLabel ? `${sectionLabel} · ${env.appName}` : env.appName;
  }, [sectionLabel, showing]);

  const row = (i: Item) => {
    // The more specific items above win over Settings' broad "/settings" match.
    const claimed = [...work, ...followUps].some((x) => x !== i && x.show && isActive(pathname, x.match));
    const active = isActive(pathname, i.match) && !(i === settings && claimed);
    return (
      <Pressable
        key={i.label}
        onPress={() => router.navigate(i.href)}
        style={({ hovered }: { hovered?: boolean }) => [
          styles.sideItem,
          active ? { backgroundColor: colors.primarySoft } : hovered ? { backgroundColor: colors.surfacePressed } : null,
        ]}
      >
        <i.Icon size={17} color={active ? colors.primary : colors.textMuted} strokeWidth={active ? 2.2 : 1.9} />
        <Text variant="bodyStrong" numberOfLines={1} style={{ color: active ? colors.primary : colors.text, flex: 1, fontSize: 14 }}>
          {i.label}
        </Text>
      </Pressable>
    );
  };
  const group = (title: string, items: Item[]) => {
    const shown = items.filter((i) => i.show);
    if (!shown.length) return null;
    return (
      <View style={{ gap: 2 }}>
        <Text variant="micro" style={[styles.sectionTitle, { color: colors.textFaint }]}>
          {title.toUpperCase()}
        </Text>
        {shown.map(row)}
      </View>
    );
  };

  if (guard.redirect) return <Redirect href={guard.redirect} />;
  if (!guard.ready) return null;
  if (featureRedirect) return <Redirect href={featureRedirect} />;

  const roots = [...work, ...followUps].filter((i) => i.show).map((i) => i.match[0]);
  const stack = (
    <SidebarRootsContext.Provider value={wide ? roots : []}>
      <WorkspaceSetupGate />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        {/* Desktop: sending a template is a card over the page it came from (that page stays in view). */}
        <Stack.Screen
          name="whatsapp/send"
          options={wide ? { presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } } : {}}
        />
      </Stack>
    </SidebarRootsContext.Provider>
  );

  if (!wide) {
    // Phone-sized window: the main sections as a bottom strip, the rest under More.
    // The same tabs as the phone app: Visits, Contacts, Today, Follow-ups, More.
    const byHref = (href: string) => [...work, ...followUps, hub].find((i) => i.href === href);
    const main = ['/(app)/visits', '/(app)/(tabs)/contacts', '/(app)/today', '/(app)/follow-ups']
      .map(byHref)
      .filter((i): i is Item => !!i && i.show)
      // Room for four beside More: Today gives way first.
      .filter((i, _, list) => list.length <= 4 || i.href !== '/(app)/today');
    const bottom = [...main, { ...settings, label: t('tabs.more'), Icon: Ellipsis }];
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.content}>{stack}</View>
        {/* Full-screen pages (an open chat…) hide the strip, as on phones. */}
        {HIDDEN.some((h) => pathname.startsWith(h)) ? null : (
          <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {bottom.map((i) => {
              const active = isActive(pathname, i.match);
              return (
                <Pressable key={i.label} onPress={() => router.navigate(i.href)} style={[styles.bottomItem, active && { backgroundColor: colors.primarySoft }]}>
                  <i.Icon size={22} color={active ? colors.primary : colors.textMuted} />
                  <Text variant="micro" tone={active ? 'primary' : 'muted'} numberOfLines={1}>
                    {i.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background, flexDirection: 'row' }]}>
      <View style={[styles.sidebar, { backgroundColor: colors.scheme === 'dark' ? colors.surface : '#FAFBFA', borderEndColor: colors.border }]}>
        <View style={styles.brand}>
          <BrandLogo height={30} />
        </View>
        <View style={{ paddingHorizontal: 12, gap: 10 }}>
          <AccountPill />
          {features.crm ? (
            <Pressable
              onPress={() => router.navigate('/(app)/search')}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.search,
                { backgroundColor: colors.surface, borderColor: hovered ? colors.borderStrong : colors.border },
              ]}
            >
              <Search size={15} color={colors.textFaint} />
              <Text variant="caption" style={{ color: colors.textFaint }}>
                {t('common.search')}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 14, gap: 18 }} showsVerticalScrollIndicator={false}>
          {group(t('more.work'), work)}
          {group(t('more.followUps'), followUps)}
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {row(settings)}
          <Pressable
            onPress={() => router.navigate('/(app)/settings/profile')}
            style={({ hovered }: { hovered?: boolean }) => [styles.profile, hovered && { backgroundColor: colors.surfacePressed }]}
          >
            <Avatar name={name} uri={profile?.avatarUrl} size={34} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1} style={{ fontSize: 14 }}>
                {name}
              </Text>
              <Text variant="micro" tone="faint" numberOfLines={1} style={{ letterSpacing: 0 }}>
                {profile?.email}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
      {/* Pages use the full width; each one caps its own reading width where it helps. */}
      <View style={styles.content}>
        {stack}
        <ContactPanel />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, position: 'relative', overflow: 'hidden' },
  sidebar: { width: 248, borderEndWidth: StyleSheet.hairlineWidth },
  brand: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { paddingHorizontal: 12, marginBottom: 4, letterSpacing: 0.6 },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, height: 36, borderRadius: 8 },
  footer: { padding: 10, gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10 },
  bottomBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  bottomItem: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6, borderRadius: 10, marginHorizontal: 4 },
});
