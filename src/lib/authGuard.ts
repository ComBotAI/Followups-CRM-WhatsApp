/**
 * Route guards for the two route groups. Each group's layout calls its guard
 * and renders a <Redirect> itself; a redirect from inside a mounted layout is
 * reliable on every platform (one from the root layout is not on Android).
 */
import { useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { hasChosenAccessId } from '@/services/accessId';
import { P } from '@/lib/permissions';
import { useAuthStore, useCan } from '@/stores/auth';
import { useAccountsStore } from '@/stores/accounts';
import { featuresOf, homeTabFor, useFeatures, type Features, type HomePerms } from '@/stores/features';
import { useWhatsAppConfig, whatsAppConfig } from '@/stores/whatsapp';

/** Signed-in area only: anyone else is sent to sign in. */
export const useAppGuard = () => {
  const status = useAuthStore((s) => s.status);
  if (status === 'booting') return { ready: false as const, redirect: null };
  if (status === 'signedIn') return { ready: true as const, redirect: null };
  const href: Href = status === 'accountLost' ? '/(auth)/accounts' : hasChosenAccessId() ? '/(auth)/login' : '/(auth)/access';
  return { ready: false as const, redirect: href };
};

/** Sign-in screens: a signed-in user is sent home, unless they are adding another account. */
export const useAuthGuard = (): Href | null => {
  const status = useAuthStore((s) => s.status);
  const adding = useAuthStore((s) => s.adding);
  return status === 'signedIn' && !adding ? homeHref(featuresOf(), whatsAppConfig().mode === 'api') : null;
};

/** Screens that belong to a feature, by path prefix. */
const FEATURE_PATHS: { prefix: string; needs: (f: Features, api: boolean) => boolean }[] = [
  { prefix: '/sync/contacts', needs: (f) => f.crm },
  // Follow-ups due, plus task and WhatsApp reminders: CRM is enough.
  { prefix: '/today', needs: (f) => f.crm },
  { prefix: '/contacts', needs: (f) => f.crm },
  { prefix: '/lead/', needs: (f) => f.crm },
  { prefix: '/board', needs: (f) => f.crm },
  { prefix: '/reminders', needs: (f) => f.crm },
  { prefix: '/followups', needs: (f) => f.followups },
  { prefix: '/import', needs: (f) => f.crm },
  { prefix: '/search', needs: (f) => f.crm },
  { prefix: '/trash', needs: (f) => f.crm },
  { prefix: '/wa-tasks', needs: (f) => f.followups },
  { prefix: '/settings/fields', needs: (f) => f.crm },
  { prefix: '/settings/services', needs: (f) => f.services },
  { prefix: '/visits', needs: (f) => f.services },
  { prefix: '/reports', needs: (f) => f.services },
  { prefix: '/settings/tags', needs: (f) => f.crm },
  { prefix: '/settings/assignment', needs: (f) => f.crm },
  { prefix: '/settings/quick-replies', needs: (f, api) => f.crm && api },
  { prefix: '/campaigns', needs: (f, api) => f.crm && api },
];

/** The account's home screen (`can`: what the role may open; everything when left out). */
export const homeHref = (f: Features, api: boolean, can?: HomePerms): Href => {
  const tab = homeTabFor(f, api, can);
  // Visits lives outside the tab group.
  return tab === 'visits' ? '/(app)/visits' : `/(app)/(tabs)/${tab}`;
};

/** A screen of a feature the active account switched off (e.g. after switching accounts) → its home. */
export const useFeatureRedirect = (): Href | null => {
  const pathname = usePathname();
  const f = useFeatures();
  const api = useWhatsAppConfig().mode === 'api';
  const can: HomePerms = { contacts: useCan(P.contacts.list) };
  if (pathname === '/') return homeHref(f, api, can);
  // Visits is the default home: a role without the contact list goes to the home it can open instead.
  if (pathname === '/visits' && !can.contacts) return homeHref(f, api, can);
  const rule = FEATURE_PATHS.find((r) => pathname.startsWith(r.prefix));
  return rule && !rule.needs(f, api) ? homeHref(f, api, can) : null;
};

const AUTH_PATHS = ['/access', '/login', '/otp', '/forgot', '/accounts'];

/**
 * Coming back from the add-account screens any way (hardware back, swipe)
 * ends "adding", so the sign-in guard works normally again. Only a return from
 * them counts: tapping "Add account" sets the flag a moment before the sign-in
 * screen opens, and must not be undone.
 */
export const useEndAddingOutsideAuth = () => {
  const pathname = usePathname();
  const inAuth = AUTH_PATHS.some((p) => pathname.startsWith(p));
  const wasInAuth = useRef(false);
  useEffect(() => {
    if (inAuth) wasInAuth.current = true;
    else if (wasInAuth.current) {
      wasInAuth.current = false;
      if (useAuthStore.getState().adding) useAuthStore.getState().cancelAddAccount();
    }
  }, [inAuth]);
};

/** A link with `?account=<id>` (e.g. from a widget set to one account) switches to that account. */
export const useAccountFromLink = () => {
  const { account } = useGlobalSearchParams<{ account?: string }>();
  useEffect(() => {
    if (!account) return;
    const { activeId, sessions } = useAccountsStore.getState();
    if (account !== activeId && sessions.some((s) => s.id === account))
      void useAuthStore
        .getState()
        .switchSession(account)
        .catch(() => undefined);
  }, [account]);
};
