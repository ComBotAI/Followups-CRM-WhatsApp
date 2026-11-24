/**
 * Web storage: the same API as the native module, on localStorage. Each
 * account gets its own key namespace; tokens sit in localStorage too, the
 * same trade-off the SSO package makes on the web by default.
 */
import type { StateStorage } from 'zustand/middleware';

const ROOT = 'fcrm:';

const ls = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

const memory = new Map<string, string>();

type KvLike = {
  getString: (k: string) => string | undefined;
  getNumber: (k: string) => number | undefined;
  set: (k: string, v: string | number | boolean) => void;
  remove: (k: string) => boolean;
  clearAll: () => void;
};

const makeStore = (prefix: string): KvLike => {
  const get = (k: string): string | undefined => ls()?.getItem(prefix + k) ?? memory.get(prefix + k);
  return {
    getString: get,
    getNumber: (k) => {
      const v = get(k);
      return v == null ? undefined : Number(v);
    },
    set: (k, v) => {
      try {
        ls()?.setItem(prefix + k, String(v));
      } catch {
        // quota / private mode
      }
      memory.set(prefix + k, String(v));
    },
    remove: (k) => {
      ls()?.removeItem(prefix + k);
      memory.delete(prefix + k);
      return true;
    },
    clearAll: () => {
      const l = ls();
      if (l) for (const key of Object.keys(l)) if (key.startsWith(prefix)) l.removeItem(key);
      for (const key of [...memory.keys()]) if (key.startsWith(prefix)) memory.delete(key);
    },
  };
};

const globalStore = makeStore(`${ROOT}g:`);
const accountStores = new Map<string, KvLike>();
let activeAccountId: string | null = null;

export const kvGlobal = (): KvLike => globalStore;

export const kvFor = (accountId: string | null | undefined): KvLike => {
  if (!accountId) return globalStore;
  let s = accountStores.get(accountId);
  if (!s) {
    s = makeStore(`${ROOT}a:${accountId}:`);
    accountStores.set(accountId, s);
  }
  return s;
};

export const setActiveStorageAccount = (accountId: string | null) => {
  activeAccountId = accountId;
};
export const activeStorageAccount = () => activeAccountId;

export const kv = (): KvLike => kvFor(activeAccountId);

export const kvStorage: StateStorage = {
  getItem: (name) => globalStore.getString(name) ?? null,
  setItem: (name, value) => globalStore.set(name, value),
  removeItem: (name) => {
    globalStore.remove(name);
  },
};

export const readJson = <T>(key: string, accountId?: string | null): T | null => {
  const raw = (accountId === undefined ? kv() : kvFor(accountId)).getString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const writeJson = (key: string, value: unknown, accountId?: string | null) =>
  (accountId === undefined ? kv() : kvFor(accountId)).set(key, JSON.stringify(value));

const tokens = makeStore(`${ROOT}t:`);

export const secure = {
  getToken: async (accountId: string) => tokens.getString(accountId) ?? null,
  setToken: async (accountId: string, token: string) => tokens.set(accountId, token),
  clearToken: async (accountId: string) => {
    tokens.remove(accountId);
  },
};

export const clearAccountStorage = async (accountId: string) => {
  await secure.clearToken(accountId);
  kvFor(accountId).clearAll();
  accountStores.delete(accountId);
};
