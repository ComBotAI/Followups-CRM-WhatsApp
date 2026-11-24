/**
 * More. Profile hero card, then grouped settings rows with coloured icons.
 */
import * as Application from 'expo-application';
import * as WebBrowser from 'expo-web-browser';
import { Redirect, router, type Href } from 'expo-router';
import {
  ChartColumn,
  Bell,
  Building2,
  ChevronRight,
  Contact,
  Database,
  FileUp,
  Info,
  Languages,
  LogOut,
  MessageCircle,
  Moon,
  Palette,
  Radio,
  ShieldCheck,
  // Shuffle, (used by a hidden row)
  Sliders,
  Tags,
  Trash2,
  UserX,
  Users,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AccountPill, ColorThemeSheet } from '@/components/accounts/AccountSwitcher';
import { BrandMark } from '@/components/Brand';
import { TAB_BAR_SPACE } from '@/components/navigation/FloatingTabBar';
import { Avatar, Group, GroupRow, Hero, Row, StatusPill, Text } from '@/components/ui';
import { LANGUAGES } from '@/i18n';
import { confirmAction } from '@/lib/dialog';
import { cachedHandle } from '@/services/crm/datastore';
import { useAccountsStore, useActiveSession } from '@/stores/accounts';
import { useAuthStore, useCan, useCanAll, useCanAny, useIsOwner, useMyName } from '@/stores/auth';
import { P } from '@/lib/permissions';
import { useFeatures } from '@/stores/features';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { rtlFlip } from '@/lib/rtl';
import { useDesktop } from '@/hooks/useDesktop';
import { env } from '@/config/env';

export default function MoreScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const context = useAuthStore((s) => s.context);
  const session = useActiveSession();
  const sessionCount = useAccountsStore((s) => s.sessions.length);
  const whatsappMode = useWhatsAppConfig().mode;
  const features = useFeatures();
  const [colorOpen, setColorOpen] = useState(false);
  const signOut = useAuthStore((s) => s.signOut);
  const isOwner = useIsOwner();
  // A member sees what their role allows.
  const can = {
    contacts: useCan(P.contacts.list),
    create: useCan(P.contacts.create),
    trash: useCanAny([P.contacts.update, P.contacts.delete]),
    campaigns: useCan(P.campaigns.list),
    channels: useCanAny([...P.channelsAny]),
    schedule: useCan(P.scheduled.create),
    services: useCan(P.app.services),
    reports: useCan(P.app.reports),
    routing: useCan(P.app.routing),
    import: useCanAll([P.contacts.create, P.app.importLeads]),
    workspace: useCan(P.app.workspaceSettings),
  };
  const name = useMyName();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const language = useSettingsStore((s) => s.language);
  const ds = cachedHandle();
  const go = (href: Href) => () => router.push(href);
  // Desktop: the groups in two columns.
  const desktop = useDesktop();
  const half = desktop ? styles.half : undefined;
  type Item = { key: string; icon: ReactNode; tint: string; title: string; subtitle?: string; href: Href };
  // Rows of a group, skipping the ones switched off (false); the last one gets no divider.
  const rows = (items: (Item | false)[]) => {
    const shown = items.filter((x): x is Item => !!x);
    return shown.map((x, i) => (
      <GroupRow key={x.key} last={i === shown.length - 1} icon={x.icon} tint={x.tint} title={x.title} subtitle={x.subtitle} onPress={go(x.href)} />
    ));
  };

  // Desktop has the settings layout (menu beside each page) instead of this list.
  if (desktop) return <Redirect href="/(app)/settings/profile" />;

  const confirmSignOut = () =>
    void confirmAction({
      title: t('auth.signOutConfirmTitle'),
      message: t('auth.signOutConfirmBody'),
      confirmText: t('auth.signOut'),
      cancelText: t('common.cancel'),
      destructive: true,
    }).then((ok) => {
      if (ok) void signOut();
    });

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <Hero top={<AccountPill inPage />}>
        <Pressable onPress={go('/(app)/settings/profile')} style={styles.profile}>
          <View style={styles.avatarRing}>
            <Avatar name={name} uri={profile?.avatarUrl} size={60} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="h2" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {profile?.email}
            </Text>
            <Row gap={6}>
              <StatusPill label={context?.accountName || t('more.myWorkspace')} color="#fff" onHero />
              <StatusPill label={isOwner ? t('common.owner') : context?.role?.title || t('common.member')} color="#fff" onHero />
            </Row>
          </View>
          <ChevronRight size={20} color={colors.textFaint} style={rtlFlip()} />
        </Pressable>
      </Hero>

      <View style={[styles.body, desktop && styles.bodyWide]}>
        {features.services && can.reports ? (
          <Group style={half}>
            <GroupRow
              icon={<ChartColumn size={18} color={colors.primary} />}
              tint={colors.primary}
              title={t('reports.title')}
              subtitle={t('reports.sub')}
              onPress={go('/(app)/reports')}
              last
            />
          </Group>
        ) : null}

        <Group style={half}>
          <GroupRow
            icon={<Building2 size={18} color={session?.color ?? colors.primary} />}
            tint={session?.color ?? colors.primary}
            title={t('accounts.manage')}
            subtitle={t('accounts.signedIn', { count: sessionCount })}
            onPress={go('/(app)/settings/accounts')}
            last
          />
        </Group>

        {/* The contact data itself: its fields, labels, where contacts come from and who gets them. Follow-up tools live in their own tab. */}
        {features.crm ? (
          <Group style={half} title={t('more.contactsData')}>
            {rows([
              isOwner && {
                key: 'fields',
                icon: <Sliders size={18} color={colors.sms} />,
                tint: colors.sms,
                title: t('more.fields'),
                subtitle: t('more.fieldsSub'),
                href: '/(app)/settings/fields',
              },
              {
                key: 'tags',
                icon: <Tags size={18} color={colors.accent} />,
                tint: colors.accent,
                title: t('more.tags'),
                subtitle: t('more.tagsSub'),
                href: '/(app)/settings/tags',
              },
              can.import && {
                key: 'import',
                icon: <FileUp size={18} color={colors.primary} />,
                tint: colors.primary,
                title: t('more.import'),
                subtitle: t('more.importSub'),
                href: '/(app)/import',
              },
              can.create &&
                Platform.OS !== 'web' && {
                  key: 'sync-contacts',
                  icon: <Contact size={18} color={colors.primary} />,
                  tint: colors.primary,
                  title: t('syncContacts.title'),
                  subtitle: t('syncContacts.moreSub'),
                  href: '/(app)/sync/contacts',
                },
              // Auto lead assignment: hidden for now.
              // features.crm &&
              //   can.routing && {
              //     key: 'assignment',
              //     icon: <Shuffle size={18} color={colors.success} />,
              //     tint: colors.success,
              //     title: t('more.assignment'),
              //     subtitle: t('more.assignmentSub'),
              //     href: '/(app)/settings/assignment',
              //   },
              can.trash && {
                key: 'trash',
                icon: <Trash2 size={18} color={colors.danger} />,
                tint: colors.danger,
                title: t('trash.title'),
                subtitle: t('more.trashSub'),
                href: '/(app)/trash',
              },
            ])}
          </Group>
        ) : null}

        {/* How the app talks to people: WhatsApp channels. */}
        <Group style={half} title={t('more.channels')}>
          {rows([
            can.channels &&
              whatsappMode === 'api' && {
                key: 'channels',
                icon: <Radio size={18} color={colors.primary} />,
                tint: colors.primary,
                title: t('channels.title'),
                subtitle: t('channels.moreSub'),
                href: '/(app)/channels',
              },
            can.workspace && {
              key: 'whatsapp',
              icon: <MessageCircle size={18} color={colors.success} />,
              tint: colors.success,
              title: t('whatsapp.settings'),
              subtitle: whatsappMode === 'api' ? t('whatsapp.modeApi') : t('whatsapp.modePhone'),
              href: '/(app)/settings/whatsapp',
            },
          ])}
        </Group>

        {/* Team: members (and their roles) and the roles & permissions themselves. Owners only. */}
        {isOwner ? (
          <Group style={half} title={t('more.team')}>
            <GroupRow
              icon={<Users size={18} color={colors.primary} />}
              tint={colors.primary}
              title={t('more.members')}
              subtitle={t('more.membersSub')}
              onPress={go('/(app)/settings/members')}
            />
            <GroupRow
              last
              icon={<ShieldCheck size={18} color={colors.accent} />}
              tint={colors.accent}
              title={t('more.roles')}
              subtitle={t('more.rolesSub')}
              onPress={go('/(app)/settings/roles')}
            />
          </Group>
        ) : null}

        <Group style={half} title={t('more.preferences')}>
          <GroupRow
            icon={<Bell size={18} color={colors.warning} />}
            tint={colors.warning}
            title={t('more.notifications')}
            subtitle={t('more.notificationsSub')}
            onPress={go('/(app)/settings/notifications')}
          />
          <GroupRow
            icon={<Languages size={18} color={colors.accent} />}
            tint={colors.accent}
            title={t('more.language')}
            subtitle={LANGUAGES.find((l) => l.code === language)?.native ?? 'English'}
            onPress={go('/(app)/settings/language')}
          />
          <GroupRow
            icon={<Palette size={18} color={colors.primary} />}
            tint={colors.primary}
            title={t('accounts.color')}
            subtitle={session?.workspaceName}
            right={<View style={[styles.swatchDot, { backgroundColor: session?.color ?? colors.primary }]} />}
            onPress={() => setColorOpen(true)}
          />
          <GroupRow
            last
            icon={<Moon size={18} color={colors.textMuted} />}
            tint={colors.textMuted}
            title={t('more.appearance')}
            subtitle={theme === 'system' ? t('more.followsDevice') : theme === 'dark' ? t('more.dark') : t('more.light')}
            onPress={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
          />
        </Group>

        <Group style={half} title={t('more.workspace')}>
          <GroupRow
            icon={<Database size={18} color={ds?.available ? colors.success : colors.warning} />}
            tint={ds?.available ? colors.success : colors.warning}
            title={t('more.setup')}
            subtitle={ds?.available ? t('more.setupOk') : ds?.reason || t('more.setupPending')}
            onPress={go('/(app)/settings/setup')}
          />
          <GroupRow
            last
            icon={<Info size={18} color={colors.textMuted} />}
            tint={colors.textMuted}
            title={t('more.about')}
            subtitle={t('more.version', {
              version: Application.nativeApplicationVersion ?? '1.0.0',
            })}
            onPress={go('/(app)/settings/about')}
          />
        </Group>

        <Group style={half}>
          {env.deleteAccountUrl ? (
            <GroupRow
              danger
              icon={<UserX size={18} color={colors.danger} />}
              tint={colors.danger}
              title={t('more.deleteAccount')}
              subtitle={t('more.deleteAccountSub')}
              onPress={() => void WebBrowser.openBrowserAsync(env.deleteAccountUrl)}
            />
          ) : null}
          <GroupRow
            last
            danger
            icon={<LogOut size={18} color={colors.danger} />}
            tint={colors.danger}
            title={t('auth.signOut')}
            onPress={confirmSignOut}
            right={<View />}
          />
        </Group>

        <ColorThemeSheet open={colorOpen} onClose={() => setColorOpen(false)} />
        <View style={[styles.footer, { width: '100%' }]}>
          <BrandMark size={26} />
          <Text variant="micro" tone="faint">
            {env.appName}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarRing: { borderRadius: 40 },
  body: { paddingHorizontal: 20, gap: 24, marginTop: 12 },
  bodyWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  half: { flexBasis: '45%', flexGrow: 1 },
  footer: { alignItems: 'center', gap: 6, opacity: 0.6, marginTop: 4 },
  swatchDot: { width: 22, height: 22, borderRadius: 7 },
});
