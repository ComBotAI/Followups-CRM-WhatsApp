/**
 * Auth state for the *active* account, on top of the multi-account store.
 *
 * Status machine:
 *   booting → signedOut | signedIn
 *   signedIn → accountLost (A403 on the active account) | signedOut (last account removed)
 *
 * Signing in while already signed in (`beginAddAccount`) adds another account;
 * the existing ones stay signed in and keep syncing.
 */
import { forgetCloudSettings } from '@/services/cloudSettings';
import { i18next } from '@/i18n';
import { isWebPreview, previewContext, startWebPreview } from '@/lib/webPreview';
import type { AccountContext, AccountOption, MappedProfile } from '@ab-ecosystem/sso';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';

import * as sso from '@/services/sso/client';
import { cachedMyAppPermissions, fetchMyAppPermissions } from '@/services/crm/rolePermissions';
import { DEFAULT_APP_PERMISSIONS, isAppPermission } from '@/lib/permissions';
import { clearAccountStorage, readJson, secure } from '@/services/storage';
import { cacheClear } from '@/services/storage/deviceCache';
import { cancelAccountNotifications, cancelReminderNotification, unregisterPushDevice } from '@/services/notifications';
import { useVisitsStore } from './visits';
import { useWhatsAppStore } from './whatsapp';
import { getAuthAccessId, labelAccessId, registerTokenAccess, setAuthAccessId } from '@/services/accessId';
import { configureSessionCheck } from '@/services/sessionExpiry';
import {
  activeSession,
  emitActiveAccountChange,
  forgetToken,
  hydrateTokens,
  sessionId,
  setTokenFor,
  tokenFor,
  useAccountsStore,
  type AccountSession,
} from './accounts';

export type AuthStatus = 'booting' | 'signedOut' | 'signedIn' | 'accountLost';

type AuthState = {
  status: AuthStatus;
  token: string | null;
  profile: MappedProfile | null;
  context: AccountContext | null;
  /** Workspaces reachable from the active login (SSO `/accounts`). */
  accounts: AccountOption[];
  pending: null | { kind: '2fa'; email: string; password: string } | { kind: 'account'; ticket: string; accounts: AccountOption[] };
  /** True while the auth screens are open to add another account. */
  adding: boolean;
  error: string | null;
  /** The account whose sign-in expired, so the sign-in screen can say so and fill in the email. */
  expired: { email: string; workspace: string } | null;
  boot: () => Promise<void>;
  /** `accessId` defaults to the one the sign-in screens chose. */
  adoptToken: (token: string, accessId?: string) => Promise<AccountSession>;
  login: (email: string, password: string, captchaToken?: string) => Promise<void>;
  verifyOtp: (code: string, captchaToken?: string) => Promise<void>;
  chooseAccount: (accountId: string) => Promise<void>;
  /** Replaces the active session with another workspace (used when access was lost). */
  switchAccount: (accountId: string) => Promise<void>;
  /** Adds another workspace of the active login as a separate, parallel account. */
  addWorkspace: (workspaceId: string) => Promise<void>;
  /** Makes another signed-in account the one the UI shows. */
  switchSession: (id: string) => Promise<void>;
  beginAddAccount: () => void;
  cancelAddAccount: () => void;
  refreshAccounts: () => Promise<void>;
  /** Signs out one account (default: the active one). */
  signOut: (id?: string) => Promise<void>;
  clearPending: () => void;
  /** Renames the signed-in person (their SSO login: every workspace they are in shows the new name). */
  updateName: (firstName: string, lastName: string) => Promise<void>;
  onUnauthorized: (accountLost: boolean) => void;
  /** The account's sign-in expired: drop its token but keep its data, and ask for the password again. */
  expireSession: (id: string) => Promise<void>;
};

const toSession = (me: sso.Me) => {
  const workspaceId = me.context?.accountId ?? '';
  return {
    id: sessionId(me.profile.id, workspaceId),
    userId: me.profile.id,
    email: me.profile.email,
    name: [me.profile.firstName, me.profile.lastName].filter(Boolean).join(' ') || me.profile.email,
    workspaceId,
    workspaceName: me.context?.accountName || [me.profile.firstName, me.profile.lastName].filter(Boolean).join(' ') || me.profile.email,
    isOwner: me.context?.isOwner ?? true,
    roleTitle: me.context?.role?.title ?? '',
  };
};

/**
 * Removes an account from the phone: its token, cached data,
 * scheduled reminder notifications and per-account settings. The next active
 * account is one that is still signed in.
 */
const forgetAccount = async (accountId: string) => {
  const reminders = readJson<{ notification_id?: string }[]>('reminders.local.v1', accountId) ?? [];
  await Promise.all(reminders.map((r) => cancelReminderNotification(r.notification_id)));
  // And everything else scheduled for it (WhatsApp tasks…), found by the account they carry.
  await cancelAccountNotifications(accountId);
  forgetCloudSettings(accountId);
  await clearAccountStorage(accountId);
  // Saved contact lists.
  await cacheClear(accountId).catch(() => undefined);
  useWhatsAppStore.getState().forget(accountId);
  useVisitsStore.getState().forget(accountId);
  useAccountsStore.getState().remove(accountId);
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'booting',
  expired: null,
  token: null,
  profile: null,
  context: null,
  accounts: [],
  pending: null,
  adding: false,
  error: null,

  boot: async () => {
    // Local web dev only: a demo session for checking layouts (see webPreview.ts).
    if (isWebPreview()) {
      const demo = await startWebPreview();
      set({ status: 'signedIn', token: demo.token, profile: demo.profile as never, context: previewContext() as never, error: null });
      return;
    }
    await hydrateTokens();
    const acc = useAccountsStore.getState();
    const valid = acc.sessions.filter((s) => tokenFor(s.id));
    if (!valid.length) {
      set({ status: 'signedOut', token: null });
      return;
    }
    const active = valid.find((s) => s.id === acc.activeId) ?? valid[0];
    // The saved active account has no token: switch, and say so (its restored lists and panel go).
    if (active.id !== acc.activeId) {
      acc.setActive(active.id);
      emitActiveAccountChange(active.id);
    }
    const token = tokenFor(active.id);
    set({ token });
    // Another account became active meanwhile (e.g. a notification tap): its own switch owns the state.
    const stillActive = () => useAccountsStore.getState().activeId === active.id;
    // A slow network must not hold the splash screen: after a few seconds the app opens on the
    // saved session and cached data, and the check below finishes in the background.
    const slow = setTimeout(() => {
      if (stillActive() && get().status === 'booting') set({ status: 'signedIn' });
    }, 4_000);
    try {
      const me = await sso.getMe(token);
      clearTimeout(slow);
      if (!stillActive()) return;
      set({ status: 'signedIn', profile: me.profile, context: me.context, error: null });
      useAccountsStore.getState().upsert({ ...toSession(me), id: active.id });
      void get().refreshAccounts();
    } catch (err) {
      clearTimeout(slow);
      if (!stillActive()) return;
      if (err instanceof sso.SsoError && err.isAccountAccessLost) {
        set({ status: 'accountLost', error: err.message });
        void get().refreshAccounts();
      } else if (err instanceof sso.SsoError && err.status === 401) {
        // Expired while the app was closed: sign in again, the account's data stays.
        await get().expireSession(active.id);
      } else {
        // Offline: keep the session and show cached data.
        set({ status: 'signedIn', error: err instanceof Error ? err.message : 'Could not reach the server' });
      }
    }
  },

  adoptToken: async (token, accessId = getAuthAccessId()) => {
    registerTokenAccess(token, accessId);
    const me = await sso.getMe(token);
    const session = useAccountsStore.getState().upsert({ ...toSession(me), accessId });
    labelAccessId(accessId, session.workspaceName);
    await setTokenFor(session.id, token);
    useAccountsStore.getState().setActive(session.id);
    // Announced at once: until then the old account's lists and panel would carry on
    // under the new account (and its lists could be saved as the new account's).
    emitActiveAccountChange(session.id);
    // Bring this account's saved settings (features, WhatsApp, preferences…) down before the app opens.
    await Promise.race([
      import('@/services/cloudSettings').then((m) => m.pullSettings(session.id)).catch(() => undefined),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
    set({ token, pending: null, adding: false, status: 'signedIn', profile: me.profile, context: me.context, error: null, expired: null });
    void get().refreshAccounts();
    return session;
  },

  login: async (email, password, captchaToken) => {
    set({ error: null });
    const res = await sso.login({ email, password, captchaToken });
    if (res.twoFactorRequired) {
      set({ pending: { kind: '2fa', email, password } });
      return;
    }
    if (res.accountSelectionRequired) {
      set({ pending: { kind: 'account', ticket: res.selectionTicket ?? '', accounts: res.accounts ?? [] } });
      return;
    }
    const token = sso.readAccessToken(res);
    if (!token) throw new sso.SsoError('No access token in the response');
    await get().adoptToken(token);
  },

  verifyOtp: async (code, captchaToken) => {
    const p = get().pending;
    if (!p || p.kind !== '2fa') throw new sso.SsoError('No sign-in is waiting for a code');
    const res = await sso.verifyTwoFactor({ email: p.email, password: p.password, twoFactorToken: code, captchaToken });
    if (res.accountSelectionRequired) {
      set({ pending: { kind: 'account', ticket: res.selectionTicket ?? '', accounts: res.accounts ?? [] } });
      return;
    }
    const token = sso.readAccessToken(res);
    if (!token) throw new sso.SsoError('No access token in the response');
    await get().adoptToken(token);
  },

  chooseAccount: async (accountId) => {
    const p = get().pending;
    if (!p || p.kind !== 'account') throw new sso.SsoError('No account selection is pending');
    const token = await sso.selectAccount(p.ticket, accountId);
    await get().adoptToken(token);
  },

  switchAccount: async (accountId) => {
    const token = get().token;
    const oldId = useAccountsStore.getState().activeId;
    if (!token) throw new sso.SsoError('Not signed in');
    const next = await sso.switchAccount(token, accountId);
    const session = await get().adoptToken(next, activeSession()?.accessId);
    // Access to the old workspace was lost (that is when this runs): drop it and its data.
    if (oldId && oldId !== session.id) await forgetAccount(oldId);
  },

  addWorkspace: async (workspaceId) => {
    const token = get().token;
    if (!token) throw new sso.SsoError('Not signed in');
    const next = await sso.switchAccount(token, workspaceId);
    await get().adoptToken(next, activeSession()?.accessId);
  },

  switchSession: async (id) => {
    const acc = useAccountsStore.getState();
    const target = acc.sessions.find((s) => s.id === id);
    const token = tokenFor(id);
    if (!target || !token) throw new sso.SsoError('That account is not signed in');
    acc.setActive(id);
    set({ token, status: 'signedIn', profile: null, context: null, accounts: [], error: null });
    emitActiveAccountChange(id);
    // A later switch may have happened while this one waited: only the active account's reply counts.
    const stillActive = () => useAccountsStore.getState().activeId === id;
    try {
      const me = await sso.getMe(token);
      if (!stillActive()) return;
      set({ profile: me.profile, context: me.context });
      void get().refreshAccounts();
    } catch (err) {
      if (!stillActive()) return;
      if (err instanceof sso.SsoError && err.isAccountAccessLost) set({ status: 'accountLost', error: err.message });
      else if (err instanceof sso.SsoError && err.status === 401) await get().expireSession(id);
    }
  },

  beginAddAccount: () => set({ adding: true, pending: null, error: null }),
  cancelAddAccount: () => set({ adding: false, pending: null }),

  refreshAccounts: async () => {
    if (isWebPreview()) return;
    const token = get().token;
    if (!token) return;
    try {
      const accounts = await sso.listAccounts(token);
      // A reply for an account switched away from meanwhile is not this account's list.
      if (get().token === token) set({ accounts });
    } catch {
      // Non-fatal.
    }
  },

  signOut: async (id) => {
    const acc = useAccountsStore.getState();
    const target = id ?? acc.activeId;
    if (!target) return;
    const wasActive = target === acc.activeId;
    const token = tokenFor(target);
    // Upload what hasn't reached the server yet (a reminder ticked done offline…) while the token
    // still works: logout revokes it, and the account's copy is wiped next. Capped, so sign-out never hangs.
    // An account in the background is flushed as well: its copy goes too.
    if (token)
      await Promise.race([
        import('@/services/crm/records').then((m) => (wasActive ? m.retryPendingRecords() : m.flushPendingRecords(target))),
        new Promise((r) => setTimeout(r, 4000)),
      ]).catch(() => undefined);
    // This device stops getting the account's pushes (contact names and message text).
    if (token) await unregisterPushDevice(target);
    if (token) await sso.logout(token).catch(() => undefined);
    if (wasActive) {
      // Move the app off the account before wiping it: its screens and queries would otherwise
      // write cache back into the storage being cleared.
      const signedOut = () => {
        useAccountsStore.getState().setActive(null);
        set({ status: 'signedOut', token: null, profile: null, context: null, accounts: [], pending: null, adding: false, error: null });
        emitActiveAccountChange(null);
      };
      const next = useAccountsStore.getState().sessions.find((x) => x.id !== target && !!tokenFor(x.id));
      // Never leave the app half-switched (that kept boot on the splash screen).
      if (next)
        await get()
          .switchSession(next.id)
          .catch(() => signedOut());
      else signedOut();
    }
    await forgetAccount(target);
  },

  clearPending: () => set({ pending: null, error: null }),

  updateName: async (firstName, lastName) => {
    const token = get().token;
    if (!token) throw new sso.SsoError('Not signed in');
    const oldName = [get().profile?.firstName, get().profile?.lastName].filter(Boolean).join(' ');
    const me = await sso.updateProfileName(token, firstName, lastName);
    // Switched account while saving: that account's profile is not this one.
    if (get().token === token) set({ profile: me.profile });
    // The name belongs to the login: every saved workspace of the same person shows it, and a
    // workspace with no name of its own is shown by the owner's name.
    const name = [me.profile.firstName, me.profile.lastName].filter(Boolean).join(' ') || me.profile.email;
    const accounts = useAccountsStore.getState();
    for (const s of accounts.sessions)
      if (s.userId === me.profile.id && (s.name !== name || (oldName && s.workspaceName === oldName)))
        accounts.upsert({ ...s, name, workspaceName: oldName && s.workspaceName === oldName ? name : s.workspaceName });
  },

  onUnauthorized: (accountLost) => {
    if (isWebPreview()) return;
    if (accountLost) {
      set({ status: 'accountLost' });
      void get().refreshAccounts();
    } else {
      const id = useAccountsStore.getState().activeId;
      if (id) void get().expireSession(id);
    }
  },

  expireSession: async (id) => {
    if (isWebPreview()) return;
    // Already handled (a 401 is reported by the request and by its caller): once is enough.
    if (!tokenFor(id)) return;
    const session = useAccountsStore.getState().sessions.find((x) => x.id === id);
    // Not signOut(): that forgets the account with its unsynced records and settings.
    // Only the token goes; signing in to the same workspace again brings everything back.
    await secure.clearToken(id).catch(() => undefined);
    forgetToken(id);
    if (session?.accessId) setAuthAccessId(session.accessId);
    if (useAccountsStore.getState().activeId !== id) return;
    // Another account is still signed in: carry on there (the expired one waits in the account list)
    // instead of a sign-in screen that can't reach it, which also stopped its background sync.
    const other = useAccountsStore.getState().sessions.find((x) => x.id !== id && !!tokenFor(x.id));
    if (other) {
      const ok = await get()
        .switchSession(other.id)
        .then(() => true)
        .catch(() => false);
      if (ok) {
        const workspace = session?.workspaceName ?? session?.email ?? '';
        void import('@/lib/dialog').then((m) => m.showAlert(i18next.t('auth.otherExpiredTitle'), i18next.t('auth.otherExpiredBody', { workspace })));
        return;
      }
    }
    set({
      status: 'signedOut',
      token: null,
      profile: null,
      context: null,
      pending: null,
      adding: false,
      error: null,
      expired: session ? { email: session.email, workspace: session.workspaceName } : null,
    });
    emitActiveAccountChange(null);
  },
}));

/**
 * Whether the signed-in person owns the workspace. Until the server's context
 * loads (offline start, just after switching account) the account's saved
 * session says; never "owner" by default, which gave members owner screens.
 */
export const useIsOwner = () => {
  const fromContext = useAuthStore((s) => s.context?.isOwner);
  const fromSession = useAccountsStore((s) => s.sessions.find((x) => x.id === s.activeId)?.isOwner ?? false);
  return fromContext ?? fromSession;
};
/**
 * Whether the server enforces role permissions on this account. Asked once per
 * session for members (the catalogue is readable by any member); owners skip
 * it. Until the answer arrives, members are treated as enforced, so options
 * appear late rather than show and then vanish.
 */
const usePermissionsEnforced = (): boolean => {
  const token = useAuthStore((s) => s.token);
  const member = !useIsOwner();
  const catalogue = useQuery({
    queryKey: ['permissions'],
    queryFn: () => sso.getPermissions(token!),
    enabled: member && !!token,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  return member && catalogue.data?.enforced !== false;
};

export const appPermKeys = { mine: (acct: string | null, roleId: string) => ['appPerms', 'mine', acct, roleId] as const, role: (id: string) => ['appPerms', 'role', id] as const };

/**
 * A member's app permissions (`P.app`), from their role's record in the data
 * store; `null` for an owner (everything). Until the record loads: the last
 * copy on this phone, else the defaults.
 */
const useMyAppPermissions = (): Set<string> | null => {
  const member = !useIsOwner();
  const roleId = useAuthStore((s) => s.context?.role?.id ?? '');
  const acct = useAccountsStore((s) => s.activeId);
  const mine = useQuery({
    queryKey: appPermKeys.mine(acct, roleId),
    queryFn: () => fetchMyAppPermissions(roleId, acct),
    enabled: member,
    staleTime: 5 * 60 * 1000,
    placeholderData: () => cachedMyAppPermissions(acct) ?? DEFAULT_APP_PERMISSIONS,
  });
  if (!member) return null;
  return new Set(mine.data ?? cachedMyAppPermissions(acct) ?? DEFAULT_APP_PERMISSIONS);
};

/** The check behind `useCan`: server keys go by the role (when enforced), app keys by the role's app permissions. */
const useAllows = () => {
  const enforced = usePermissionsEnforced();
  const app = useMyAppPermissions();
  const context = useAuthStore((s) => s.context);
  return (permission: string) =>
    isAppPermission(permission) ? !app || app.has(permission.toUpperCase()) : !enforced || sso.hasPermission(context, permission);
};

/**
 * Whether the signed-in person may do something: a permission key such as
 * `CRM.CONTACT.DELETE` or one of the app's own (`P.app`, see `@/lib/permissions`).
 * Owners may do everything; so may members while the account doesn't enforce
 * the server's permissions (the app's own always apply).
 */
export const useCan = (permission: string) => useAllows()(permission);

/** True when any of the keys is allowed (e.g. listing channels of any type). */
export const useCanAny = (permissions: string[]) => permissions.some(useAllows());

/** True when every key is allowed (e.g. a team list and the app's team reports). */
export const useCanAll = (permissions: string[]) => permissions.every(useAllows());
/**
 * The signed-in user's id. Falls back to the saved session's when the profile
 * isn't loaded (offline start, a failed switch), so records never get a blank author.
 */
export const myUserId = (): string => useAuthStore.getState().profile?.id || activeSession()?.userId || '';
export const useMyId = () => {
  const fromProfile = useAuthStore((s) => s.profile?.id);
  const fromSession = useAccountsStore((s) => s.sessions.find((x) => x.id === s.activeId)?.userId);
  return fromProfile || fromSession || '';
};

export const useMyName = () => useAuthStore((s) => [s.profile?.firstName, s.profile?.lastName].filter(Boolean).join(' ') || s.profile?.email || 'You');

// A 401 anywhere while the app is open is checked here once (see sessionExpiry.ts).
configureSessionCheck({
  verify: async (token) => {
    try {
      await sso.getMe(token);
      return 'valid';
    } catch (err) {
      if (!(err instanceof sso.SsoError)) return 'unknown';
      if (err.isAccountAccessLost) return 'lost';
      return err.status === 401 ? 'expired' : 'unknown';
    }
  },
  onExpired: (id) => void useAuthStore.getState().expireSession(id),
  onLost: () => useAuthStore.getState().onUnauthorized(true),
});
