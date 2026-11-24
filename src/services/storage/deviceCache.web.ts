/**
 * The device cache of server data (contact lists) in a browser:
 * IndexedDB, not localStorage. Its ~5 MB quota is shared with settings and
 * reminders, and a long history would fill it. Without IndexedDB (some private
 * windows) nothing is cached and screens simply load from the server.
 */
const DB = 'fcrm-cache';
const STORE = 'kv';

let opening: Promise<IDBDatabase | null> | null = null;

const db = () =>
  (opening ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));

const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> => {
  const d = await db();
  if (!d) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const k = (acct: string, key: string) => `${acct}|${key}`;

export const cacheGet = async (acct: string, key: string): Promise<string | null> => {
  const v = await run<unknown>('readonly', (s) => s.get(k(acct, key)));
  return typeof v === 'string' ? v : null;
};

export const cacheSet = async (acct: string, key: string, value: string) => {
  await run('readwrite', (s) => s.put(value, k(acct, key)));
};

export const cacheRemove = async (acct: string, key: string) => {
  await run('readwrite', (s) => s.delete(k(acct, key)));
};

export const cacheClear = async (acct: string) => {
  await run('readwrite', (s) => s.delete(IDBKeyRange.bound(`${acct}|`, `${acct}|￿`)));
};
