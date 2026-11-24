/**
 * Web "Save password": the same API as the native module, in the browser's
 * localStorage (the same place the web app keeps its session tokens). Kept
 * under its own key prefix, so signing out or a session expiring, which clear
 * account and token keys, never remove it; only the user does (unticking
 * "Save password").
 */
export type SavedLogin = { email: string; password: string; savedAt: number };

const MAX = 5;
const keyFor = (accessId: string) => `fcrm:pw:${accessId || 'default'}`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const ls = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

const read = (accessId: string): SavedLogin[] => {
  try {
    const raw = ls()?.getItem(keyFor(accessId));
    const list = raw ? (JSON.parse(raw) as SavedLogin[]) : [];
    return Array.isArray(list) ? list.filter((l) => l && typeof l.email === 'string' && typeof l.password === 'string') : [];
  } catch {
    return [];
  }
};

const write = (accessId: string, list: SavedLogin[]) => {
  try {
    if (list.length) ls()?.setItem(keyFor(accessId), JSON.stringify(list.slice(0, MAX)));
    else ls()?.removeItem(keyFor(accessId));
  } catch {
    // Private mode / storage full: the user simply types the password next time.
  }
};

export const savedLogins = async (accessId: string) => read(accessId);

export const saveLogin = async (accessId: string, email: string, password: string) => {
  const list = read(accessId).filter((l) => !same(l.email, email));
  write(accessId, [{ email: email.trim(), password, savedAt: Date.now() }, ...list]);
};

export const forgetSavedLogin = async (accessId: string, email: string) => {
  const list = read(accessId);
  const next = list.filter((l) => !same(l.email, email));
  if (next.length !== list.length) write(accessId, next);
};
