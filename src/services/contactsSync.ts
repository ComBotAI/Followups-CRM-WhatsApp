/**
 * Phone contacts → CRM leads, per account (name and number only). The user
 * picks which contacts to add and can skip any for good: skipped contacts
 * are never offered again or auto-added, until restored. Imports for one
 * account run one at a time (manual and auto, from any trigger), so the same
 * number is never created twice. Contacts whose number is already a lead
 * are linked, not duplicated. Optionally, new phone contacts are added on
 * their own (on app open, on contact changes while the app runs, and from
 * the background sync).
 */
import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { Platform } from 'react-native';

import { normalizePhone, phoneKey } from '@/lib/phone';
import { readJson, writeJson } from '@/services/storage';
import { activeAccountId } from '@/stores/accounts';
import { createLead, findLeadByPhone } from './crm/leads';
import { featuresOf } from '@/stores/features';

export type PhoneContact = { id: string; name: string; phone: string; key: string };

const EXCLUDED = 'contactsync.excluded.v1';
const IMPORTED = 'contactsync.imported.v1';
const KNOWN = 'contactsync.known.v1';
const AUTO = 'contactsync.auto.v1';

type Acct = string | null;
const cur = (a?: Acct) => (a === undefined ? activeAccountId() : a);

export const excludedContacts = (a?: Acct) => new Set(readJson<string[]>(EXCLUDED, cur(a)) ?? []);
export const setExcludedContacts = (ids: Iterable<string>, a?: Acct) => writeJson(EXCLUDED, [...new Set(ids)], cur(a));
/** Skips phone contacts for good: never offered, never auto-added. */
export const skipContacts = (ids: Iterable<string>, a?: Acct) => setExcludedContacts([...excludedContacts(a), ...ids], a);
/** Offers skipped contacts again. */
export const unskipContacts = (ids: Iterable<string>, a?: Acct) => {
  const back = new Set(ids);
  setExcludedContacts([...excludedContacts(a)].filter((id) => !back.has(id)), a);
};
/** Contact id → lead id for contacts already in the CRM. */
export const importedContacts = (a?: Acct) => readJson<Record<string, string>>(IMPORTED, cur(a)) ?? {};
const markImported = (map: Record<string, string>, a?: Acct) => writeJson(IMPORTED, { ...importedContacts(a), ...map }, cur(a));

export const autoAddEnabled = (a?: Acct) => readJson<boolean>(AUTO, cur(a)) ?? false;
export const setAutoAdd = async (on: boolean, a?: Acct) => {
  // Fixed now: reading the phone's contacts takes a while, and a switch meanwhile must not mark them "seen" elsewhere.
  const acct = cur(a);
  writeJson(AUTO, on, acct);
  // Everything on the phone today counts as "seen": only contacts added from now on are auto-added.
  if (on)
    writeJson(
      KNOWN,
      (await loadPhoneContacts().catch(() => [])).map((c) => c.id),
      acct,
    );
};

export const contactsPermission = async (ask = false) => {
  if (Platform.OS === 'web') return false;
  const r = ask ? await requestPermissionsAsync() : await getPermissionsAsync();
  return r.granted;
};

/** Every phone contact with a usable number, one row per number owner, sorted by name. */
export const loadPhoneContacts = async (): Promise<PhoneContact[]> => {
  if (!(await contactsPermission())) return [];
  // Only what a lead is made from: reading emails and companies too slows a big address book down for nothing.
  const rows = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES] as const, {
    limit: 10000,
    offset: 0,
  });
  const seen = new Set<string>();
  const out: PhoneContact[] = [];
  for (const r of rows) {
    const phone = normalizePhone(r.phones?.[0]?.number ?? '');
    if (!phone) continue;
    const key = phoneKey(phone);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: r.id, name: r.fullName || phone, phone, key });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
};

export type ImportResult = { created: number; linked: number; failed: number };

/**
 * One import at a time per account: a second (auto-add from another trigger, or the user's own)
 * waits for the first, then finds what it just created instead of adding it again.
 */
const importChain = new Map<string, Promise<unknown>>();
const serial = <T>(acct: Acct, task: () => Promise<T>): Promise<T> => {
  const key = acct ?? '';
  const run = (importChain.get(key) ?? Promise.resolve()).catch(() => undefined).then(task);
  importChain.set(key, run);
  return run;
};

/** Adds the given contacts as leads (3 at a time), skipping numbers already in the CRM. */
export const importContacts = (contacts: PhoneContact[], onProgress?: (done: number, total: number) => void, a?: Acct): Promise<ImportResult> => {
  // Fixed at the start: switching accounts midway must not move the rest of the import.
  const acct = cur(a);
  return serial(acct, () => importNow(contacts, onProgress, acct));
};

const importNow = async (contacts: PhoneContact[], onProgress: ((done: number, total: number) => void) | undefined, acct: Acct): Promise<ImportResult> => {
  const result: ImportResult = { created: 0, linked: 0, failed: 0 };
  if (!contacts.length) return result;
  const a = acct;
  // Already in the CRM by now (an import that ran just before): nothing to do for those.
  const already = importedContacts(a);
  contacts = contacts.filter((c) => !already[c.id]);
  const imported: Record<string, string> = {};
  let done = 0;
  const queue = [...contacts];
  const worker = async () => {
    for (;;) {
      const c = queue.shift();
      if (!c) return;
      try {
        const existing = await findLeadByPhone(`+${c.phone}`, cur(a));
        if (existing) {
          imported[c.id] = existing.id;
          result.linked += 1;
        } else {
          const [firstName, ...rest] = c.name.split(' ').filter(Boolean);
          const lead = await createLead(
            {
              firstName: firstName ?? '',
              lastName: rest.join(' '),
              // Already normalized: the + keeps createLead from adding a country code again.
              phone: `+${c.phone}`,
              status: 'New',
            },
            cur(a),
          );
          imported[c.id] = lead.id;
          result.created += 1;
        }
      } catch {
        result.failed += 1;
      }
      done += 1;
      onProgress?.(done, contacts.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  markImported(imported, a);
  return result;
};

/** Auto-add runs from several triggers at once (app open, contact changes, background): one per account at a time. */
const autoRunning = new Map<string, Promise<number>>();

/** Auto-add: imports phone contacts that appeared since last time (if the account turned it on). */
export const autoAddNewContacts = (account?: Acct): Promise<number> => {
  const key = cur(account) ?? '';
  const running = autoRunning.get(key);
  if (running) return running;
  const p = autoAddNow(account).finally(() => autoRunning.delete(key));
  autoRunning.set(key, p);
  return p;
};

const autoAddNow = async (account?: Acct): Promise<number> => {
  // Fixed now: reading thousands of phone contacts takes a while, and a switch meanwhile must not
  // import them into the account that is active by then.
  const a = cur(account);
  // Phone contacts → leads is a CRM feature.
  if (!featuresOf(cur(a)).crm || !autoAddEnabled(a) || !(await contactsPermission())) return 0;
  const all = await loadPhoneContacts();
  const known = new Set(readJson<string[]>(KNOWN, cur(a)) ?? []);
  const skip = excludedContacts(a);
  const done = importedContacts(a);
  const fresh = all.filter((c) => !known.has(c.id) && !skip.has(c.id) && !done[c.id]);
  if (fresh.length) await importContacts(fresh, undefined, a);
  // Contacts that failed (offline, server error) stay unknown so the next pass tries them again.
  const added = importedContacts(a);
  const failed = new Set(fresh.filter((c) => !added[c.id]).map((c) => c.id));
  writeJson(
    KNOWN,
    all.filter((c) => !failed.has(c.id)).map((c) => c.id),
    cur(a),
  );
  return fresh.length;
};
