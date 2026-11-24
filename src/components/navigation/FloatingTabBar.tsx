/**
 * Bottom tab bar, shown on every screen of the app (not just the tabs): it is
 * drawn once by the app layout and reads the current route itself.
 *
 * Visits · Contacts · Today · Follow-ups · More (Today gives way first if more
 * than five ever apply).
 *
 * A flat bar with a hairline top border and blur-free solid surface; the
 * active tab gets an indigo icon and label.
 */
import * as Haptics from 'expo-haptics';
import { router, usePathname } from 'expo-router';
import { Ellipsis, ListTodo, Repeat, Store, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useCan } from '@/stores/auth';
import { P } from '@/lib/permissions';
import { useFeatures } from '@/stores/features';
import { useTheme } from '@/theme/ThemeProvider';

type TabName = 'contacts' | 'visits' | 'today' | 'hub' | 'more';

/** Full-screen pages (the workspace setup): no bottom bar (phones, and narrow web windows). */
export const HIDDEN = ['/workspace-setup'];

/** Height the bar covers at the bottom; screens pad by this so nothing hides behind it. */
export const useTabBarInset = () => {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  if (Platform.OS === 'web' || HIDDEN.some((h) => pathname.startsWith(h))) return 0;
  return 62 + Math.max(insets.bottom, 8);
};

const ICONS: Record<TabName, typeof Users> = {
  contacts: Users,
  visits: Store,
  today: ListTodo,
  hub: Repeat,
  more: Ellipsis,
};

export const TAB_BAR_SPACE = 96;

/** Which tab a path belongs to, so detail screens keep their section lit. */
const tabFor = (path: string): TabName | null => {
  // The board is a view of the contacts.
  if (path.startsWith('/contacts') || path.startsWith('/lead/') || path.startsWith('/import') || path.startsWith('/board'))
    return 'contacts';
  if (path.startsWith('/visits') || path.startsWith('/settings/services')) return 'visits';
  if (path.startsWith('/today')) return 'today';
  // Everything that brings people back lives under Follow-ups.
  if (
    path.startsWith('/follow-ups') ||
    path.startsWith('/reminders') ||
    path.startsWith('/followups') ||
    path.startsWith('/wa-tasks') ||
    path.startsWith('/campaigns') ||
    path.startsWith('/settings/quick-replies')
  )
    return 'hub';
  if (path.startsWith('/more') || path.startsWith('/settings') || path.startsWith('/whatsapp')) return 'more';
  return null;
};

export function FloatingTabBar() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  // Tabs follow the account's features.
  const features = useFeatures();
  const canContacts = useCan(P.contacts.list);
  if (HIDDEN.some((h) => pathname.startsWith(h))) return null;
  const activeName = tabFor(pathname);
  // Where the day's work is: contacts (list or board), who to reach today, and the follow-up tools.
  // The board opens from Contacts, settings from More.
  // A member sees the sections their role can open.
  // Visits first: it is where the app opens.
  const all: TabName[] = [
    ...(features.services && canContacts ? (['visits'] as const) : []),
    ...(features.crm && canContacts ? (['contacts'] as const) : []),
    ...(features.crm && canContacts ? (['today', 'hub'] as const) : []),
    'more',
  ];
  // Five fit: Today gives way first (the Follow-ups tab lists it too).
  const tabs = all.length > 5 ? all.filter((n) => n !== 'today') : all;
  const bottom = Math.max(insets.bottom, 8);

  const Tab = ({ name }: { name: TabName }) => {
    const Icon = ICONS[name];
    const focused = activeName === name;
    const atRoot = pathname === (name === 'hub' ? '/follow-ups' : `/${name}`);
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        onPress={() => {
          void Haptics.selectionAsync();
          if (!atRoot) router.navigate(name === 'today' ? '/(app)/today' : name === 'hub' ? '/(app)/follow-ups' : name === 'visits' ? '/(app)/visits' : `/(app)/(tabs)/${name}`);
        }}
        style={styles.tab}
      >
        <View>
          <Icon size={22} color={focused ? colors.primary : colors.textFaint} strokeWidth={focused ? 2.2 : 1.8} />
        </View>
        <Text
          variant="micro"
          style={{ color: focused ? colors.primary : colors.textMuted, fontWeight: focused ? '600' : '500', letterSpacing: 0 }}
          numberOfLines={1}
        >
          {t(name === 'contacts' ? 'tabs.leads' : name === 'today' ? 'today.title' : name === 'hub' ? 'more.followUps' : name === 'visits' ? 'visits.title' : `tabs.${name}`)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={[styles.bar, { backgroundColor: colors.tabBar, borderTopColor: colors.border, paddingBottom: bottom }]}>
        {tabs.map((n) => (
          <Tab key={n} name={n} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  badge: {
    position: 'absolute',
    top: -5,
    end: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
});
