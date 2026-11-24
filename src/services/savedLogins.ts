/**
 * "Save password": the email and password a user chose to keep on this device,
 * so signing in again after a sign-out or an expired session is one tap.
 *
 * Kept per Access ID (a login belongs to one project), newest first, in the
 * Keychain / Keystore (expo-secure-store). Separate from account data: signing
 * out or a session expiring never removes it; only the user does (unticking
 * "Save password").
 */
import * as SecureStore from 'expo-secure-store';

export type SavedLogin = { email: string; password: string; savedAt: number };

/** A few logins per project at most (Keychain values are best kept small). */
const MAX = 5;

const keyFor = (accessId: string) => `fcrm.pw.${(accessId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)}`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const read = async (accessId: string): Promise<SavedLogin[]> => {
  try {
    const raw = await SecureStore.getItemAsync(keyFor(accessId));
    const list = raw ? (JSON.parse(raw) as SavedLogin[]) : [];
    return Array.isArray(list) ? list.filter((l) => l && typeof l.email === 'string' && typeof l.password === 'string') : [];
  } catch {
    return [];
  }
};

const write = async (accessId: string, list: SavedLogin[]) => {
  try {
    if (list.length) await SecureStore.setItemAsync(keyFor(accessId), JSON.stringify(list.slice(0, MAX)));
    else await SecureStore.deleteItemAsync(keyFor(accessId));
  } catch {
    // Keychain unavailable: the user simply types the password next time.
  }
};

/** The saved logins for a project, most recently used first. */
export const savedLogins = (accessId: string) => read(accessId);

export const saveLogin = async (accessId: string, email: string, password: string) => {
  const list = (await read(accessId)).filter((l) => !same(l.email, email));
  await write(accessId, [{ email: email.trim(), password, savedAt: Date.now() }, ...list]);
};

export const forgetSavedLogin = async (accessId: string, email: string) => {
  const list = await read(accessId);
  const next = list.filter((l) => !same(l.email, email));
  if (next.length !== list.length) await write(accessId, next);
};
