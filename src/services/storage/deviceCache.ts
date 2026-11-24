/**
 * The device cache of server data (contact lists) on a phone:
 * one MMKV file per account, apart from the account's main store so a long
 * history never slows the reads of settings and reminders. Async like the web
 * version, which sits on IndexedDB. Cleared when the account signs out.
 */
import { createMMKV, type MMKV } from 'react-native-mmkv';

const stores = new Map<string, MMKV>();

const of = (acct: string): MMKV => {
  let s = stores.get(acct);
  if (!s) {
    s = createMMKV({ id: `fcrm-cache-${acct.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}` });
    stores.set(acct, s);
  }
  return s;
};

export const cacheGet = async (acct: string, key: string): Promise<string | null> => of(acct).getString(key) ?? null;

export const cacheSet = async (acct: string, key: string, value: string) => of(acct).set(key, value);

export const cacheRemove = async (acct: string, key: string) => {
  of(acct).remove(key);
};

export const cacheClear = async (acct: string) => {
  of(acct).clearAll();
  stores.delete(acct);
};
