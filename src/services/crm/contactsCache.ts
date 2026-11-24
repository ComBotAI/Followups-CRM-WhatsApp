/**
 * Contact lists kept on the device, per account: every list the user has
 * loaded (each filter, segment and agent apart; typed searches are not kept).
 * Opening the app puts them back into the query cache with the time they were
 * fetched, so Contacts shows at once and React Query refreshes the loaded
 * pages once in the background, which brings in new and changed contacts. The
 * server has no "changed since" read, so that refresh is how edits by
 * teammates arrive.
 *
 * Campaign results (the counts on each campaign card) are kept the same way.
 *
 * Written after every successful fetch; a contact moved to the trash leaves
 * with the refresh that follows it. Cleared when the account signs out.
 */
import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query';

import { isWebPreview } from '@/lib/webPreview';
import { cacheGet, cacheSet } from '@/services/storage/deviceCache';
import { activeAccountId } from '@/stores/accounts';
import type { LeadFilter } from '@/lib/filters';

const INDEX = 'contacts.index.v1';
const entryKey = (hash: string) => `contacts.q.v1.${hash}`;

type Saved = { key: QueryKey; data: unknown; at: number };

const parse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const keepable = (key: QueryKey) =>
  (key[0] === 'leads' && !(key[1] as LeadFilter | undefined)?.search?.trim()) ||
  // Campaign results: shown at once from the device, refreshed in the background.
  (key[0] === 'campaigns' && key[1] === 'stats');

/** Puts the account's saved contact lists into the query cache (only where nothing newer is there). */
export const restoreContacts = async (qc: QueryClient, acct: string | null) => {
  if (!acct || isWebPreview()) return;
  const hashes = parse<string[]>(await cacheGet(acct, INDEX).catch(() => null)) ?? [];
  const rows = await Promise.all(hashes.map((h) => cacheGet(acct, entryKey(h)).then((r) => parse<Saved>(r)).catch(() => null)));
  // Switched again while reading (slow on web): these lists belong to an account no longer on screen.
  if (activeAccountId() !== acct) return;
  for (const row of rows) {
    if (!row || qc.getQueryState(row.key)?.dataUpdatedAt) continue;
    qc.setQueryData(row.key, row.data, { updatedAt: row.at });
  }
};

/**
 * Saves each contact list after it loads. `account` is read when the result
 * lands; a fetch that outlived an account switch was cleared with the old
 * account's queries and is no longer in the cache, so it is not written.
 */
export const saveContactsFrom = (qc: QueryClient, account: () => string | null) => {
  const pending = new Map<string, Saved & { acct: string }>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  // One flush at a time, each reading the account's index afresh (it may have been cleared by a sign-out).
  let running: Promise<void> = Promise.resolve();

  const flush = async () => {
    const jobs = [...pending.values()];
    pending.clear();
    const byAcct = new Map<string, typeof jobs>();
    for (const job of jobs) byAcct.set(job.acct, [...(byAcct.get(job.acct) ?? []), job]);
    for (const [acct, list] of byAcct) {
      const hashes = new Set(parse<string[]>(await cacheGet(acct, INDEX).catch(() => null)) ?? []);
      const before = hashes.size;
      for (const job of list) {
        const hash = hashKey(job.key);
        await cacheSet(acct, entryKey(hash), JSON.stringify({ key: job.key, data: job.data, at: job.at } satisfies Saved)).catch(() => undefined);
        hashes.add(hash);
      }
      if (hashes.size !== before) await cacheSet(acct, INDEX, JSON.stringify([...hashes])).catch(() => undefined);
    }
  };

  return qc.getQueryCache().subscribe((e) => {
    if (e.type !== 'updated' || e.action.type !== 'success' || !keepable(e.query.queryKey) || isWebPreview()) return;
    const acct = account();
    if (!acct || qc.getQueryCache().get(e.query.queryHash) !== e.query) return;
    pending.set(`${acct}|${e.query.queryHash}`, { acct, key: e.query.queryKey, data: e.query.state.data, at: e.query.state.dataUpdatedAt });
    timer ??= setTimeout(() => {
      timer = null;
      running = running.then(flush, flush);
    }, 1000);
  });
};
