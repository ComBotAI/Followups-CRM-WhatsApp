/**
 * Access ID: the project id that both the SSO and the CPaaS gateway are
 * addressed by. It is chosen per account: the user types it or scans its QR
 * code before signing in, and every account remembers its own. The SSO and
 * CPaaS origins stay fixed in `.env`.
 *
 * - `authAccessId` is the id the sign-in screens are working with right now
 *   (login, signup, forgot password, 2FA, workspace picker).
 * - Requests made with a token use the Access ID of the account that token
 *   belongs to (`accessIdForToken`).
 *
 * A build with `EXPO_PUBLIC_ACCESS_ID` set is locked to that id: it is always
 * the sign-in id, links and invites can't change it, and the Access ID screen
 * is skipped.
 */
import { env } from '@/config/env';
import { kvGlobal } from '@/services/storage';

const AUTH_KEY = 'auth.accessId';
const RECENT_KEY = 'auth.recentAccessIds.v1';

export type RecentAccess = { id: string; label: string; logo: string | null; usedAt: number };

const clean = (id: string) => id.trim();

/** Pulls an Access ID out of a scanned QR: a bare id, a URL `?access_id=` / `?project=`, or `followupscrm://access/<id>`. */
export const parseAccessId = (raw: string): string => {
  const s = raw.trim();
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      const u = new URL(s);
      const q = u.searchParams.get('access_id') || u.searchParams.get('accessId') || u.searchParams.get('project') || u.searchParams.get('projectId');
      if (q) return clean(q);
      const parts = `${u.host}${u.pathname}`.split('/').filter(Boolean);
      const i = parts.findIndex((p) => p === 'access');
      if (i >= 0 && parts[i + 1]) return clean(decodeURIComponent(parts[i + 1]));
      if (parts.length) return clean(decodeURIComponent(parts[parts.length - 1]));
    }
  } catch {
    // not a URL
  }
  return clean(s);
};

export const looksLikeAccessId = (id: string) => /^[A-Za-z0-9._:-]{4,120}$/.test(id.trim());

const FIXED = env.fixedAccessId;

/** Whether this build is locked to one Access ID (`EXPO_PUBLIC_ACCESS_ID`). */
export const isAccessIdFixed = () => !!FIXED;

let authAccessId: string = FIXED || (kvGlobal().getString(AUTH_KEY) ?? '');

/** The id the sign-in flow is using: the Access ID the user entered on this device. */
export const getAuthAccessId = (): string => authAccessId;
/** Whether the user has entered an Access ID on this device. */
export const hasChosenAccessId = () => !!authAccessId;

export const setAuthAccessId = (id: string) => {
  // Locked builds keep their one id, whatever a link or saved account says.
  authAccessId = FIXED || clean(id);
  if (authAccessId) kvGlobal().set(AUTH_KEY, authAccessId);
  else kvGlobal().remove(AUTH_KEY);
  listeners.forEach((l) => l(authAccessId));
};

const listeners = new Set<(id: string) => void>();
export const onAuthAccessIdChange = (l: (id: string) => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

// ---------- token → Access ID ----------

const byToken = new Map<string, string>();
export const registerTokenAccess = (token: string, accessId: string) => {
  if (token && accessId) byToken.set(token, accessId);
};
export const forgetTokenAccess = (token: string) => byToken.delete(token);
export const accessIdForToken = (token?: string | null): string => (token && byToken.get(token)) || getAuthAccessId();

// ---------- recently used ids ----------

export const recentAccessIds = (): RecentAccess[] => {
  try {
    return JSON.parse(kvGlobal().getString(RECENT_KEY) ?? '[]') as RecentAccess[];
  } catch {
    return [];
  }
};

export const rememberAccessId = (entry: Omit<RecentAccess, 'usedAt'>) => {
  const rest = recentAccessIds().filter((r) => r.id !== entry.id);
  kvGlobal().set(RECENT_KEY, JSON.stringify([{ ...entry, usedAt: Date.now() }, ...rest].slice(0, 8)));
};

/** Names a saved Access ID after the workspace signed in with it, so the ID itself never has to be shown. */
export const labelAccessId = (id: string, label: string) => {
  const list = recentAccessIds();
  const hit = list.find((r) => r.id === id);
  if (!hit || !label || hit.label === label) return;
  kvGlobal().set(RECENT_KEY, JSON.stringify(list.map((r) => (r.id === id ? { ...r, label } : r))));
};

export const forgetAccessId = (id: string) => kvGlobal().set(RECENT_KEY, JSON.stringify(recentAccessIds().filter((r) => r.id !== id)));
