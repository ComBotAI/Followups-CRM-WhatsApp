/**
 * The app's own tables, kept in a CPaaS **cloud data store**.
 *
 * Contacts hold their state in custom fields; the data store holds the
 * *history* — one row per remark and reminder (plus follow-up series,
 * services and settings) — because a contact has nowhere to put a growing list and contact
 * notes are not mounted on the audience service yet.
 *
 * Bootstrap is idempotent: find-or-create the store by title, then each
 * collection by title. Ids are cached in MMKV so a cold start costs nothing.
 * One store per account, every table a collection inside it. Only the
 * account's owner creates anything (the store, a table, a newer table's
 * fields); a team member only finds them, and until the owner has opened the
 * app their history stays on the phone (local tier) and uploads later.
 * If the plan includes no data store, `available` is false and the
 * repositories fall back to the local tier (see `records.ts`).
 */
import type { DataStoreCollection, DataStoreField, DataStorePlanCatalogue, SearchDataStoreRecordsInput } from '@ab-ecosystem/cpaas';

import { env } from '@/config/env';
import { createLimiter } from '@/lib/pool';
import { readJson, writeJson } from '@/services/storage';
import { activeAccountId, useAccountsStore } from '@/stores/accounts';
import { featuresOf } from '@/stores/features';
import { crmFor, describeCrmError, isFinalPlanError, isPlanError } from './client';

/** EXPO_PUBLIC_DATASTORE_TITLE (defaults to the app name). Changing it on a live app makes workspaces start a new, empty store. */
export const STORE_TITLE = env.datastoreTitle;

/** The plan a new store is created on, as the owner picked it in the workspace setup. */
export type DataStorePlanChoice = { plan: string; duration?: string };

/** The data store plans this account can create its store on (already filtered for it by CPaaS), and its store allowance. */
export const listDataStorePlans = (acct?: string | null): Promise<DataStorePlanCatalogue> => crmFor(acct ?? activeAccountId()).dataStores.plans();

export const COLLECTIONS = {
  remarks: 'remarks',
  reminders: 'reminders',
  sequences: 'followup_sequences',
  waTasks: 'whatsapp_tasks',
  services: 'services',
  serviceVisits: 'service_visits',
  serviceRuns: 'service_runs',
  settings: 'app_settings',
  rolePermissions: 'role_permissions',
} as const;
export type CollectionKey = keyof typeof COLLECTIONS;

/**
 * The tables each account needs, from the features it has on: CRM keeps remarks and
 * reminders; Auto follow-ups the
 * series and "WhatsApp to send"; Services its catalogue, visits and runs; cloud sync its
 * settings. Nothing on → no data store at all.
 */
export const requiredCollections = (acct: string | null): CollectionKey[] => {
  const f = featuresOf(acct);
  const keys: CollectionKey[] = [];
  if (f.crm) keys.push('remarks', 'reminders');
  if (f.followups) keys.push('sequences', 'waTasks');
  if (f.services) keys.push('services', 'serviceVisits', 'serviceRuns');
  // Settings sync (see cloudSettings).
  if (f.cloudSync || keys.length) keys.push('settings');
  // The app's own role permissions live wherever the app keeps anything.
  if (keys.length) keys.push('rolePermissions');
  return keys;
};

const SCHEMAS: Record<CollectionKey, { title: string; fields: DataStoreField[] }> = {
  rolePermissions: {
    title: 'Role permissions',
    fields: [
      { name: 'role_id', type: 'String', label: 'Role' },
      { name: 'role_title', type: 'String' },
      { name: 'permissions', type: 'String', label: 'App permissions (comma separated)' },
      { name: 'updated_on', type: 'Date' },
    ],
  },
  waTasks: {
    title: 'WhatsApp to send',
    fields: [
      { name: 'contact_id', type: 'String', label: 'Contact' },
      { name: 'contact_name', type: 'String' },
      { name: 'phone', type: 'String' },
      { name: 'sequence_id', type: 'String', label: 'Follow-up sequence' },
      { name: 'sequence_name', type: 'String' },
      { name: 'step_index', type: 'Number', default: 0 },
      { name: 'text', type: 'String', label: 'Message, fields already filled in' },
      { name: 'due_at', type: 'Date' },
      { name: 'member_id', type: 'String', label: 'Who sends it (the lead owner)' },
      { name: 'status', type: 'String', label: 'pending | sent | skipped | cancelled' },
      { name: 'done_at', type: 'Date' },
      { name: 'conditions_json', type: 'String', label: 'Send only while the lead matches' },
      { name: 'on_fail', type: 'String', label: 'skip | cancel_series' },
      { name: 'run_id', type: 'String', label: 'Service reminder run (restarted by a new visit)' },
    ],
  },
  services: {
    title: 'Services',
    fields: [
      { name: 'name', type: 'String' },
      { name: 'price', type: 'Number', label: 'Usual price (optional)' },
      { name: 'resets', type: 'String', label: 'Other services this one also counts as (ids, comma separated)' },
      { name: 'remind_days', type: 'Number', label: 'Usually comes back after (days)' },
      { name: 'active', type: 'Boolean', default: true },
      { name: 'sort', type: 'Number', default: 0 },
    ],
  },
  serviceVisits: {
    title: 'Service visits',
    fields: [
      { name: 'contact_id', type: 'String', label: 'Contact' },
      { name: 'contact_name', type: 'String' },
      { name: 'service_ids', type: 'String', label: 'Services (ids, comma separated)' },
      { name: 'service_names', type: 'String' },
      { name: 'visited_at', type: 'Date' },
      { name: 'price', type: 'Number', label: 'Amount charged (optional)' },
      { name: 'member_id', type: 'String', label: 'Staff' },
      { name: 'member_name', type: 'String' },
      { name: 'note', type: 'String' },
      { name: 'party_size', type: 'Number', label: 'People in the party (restaurants)' },
      { name: 'returning', type: 'Boolean', label: 'The guest had visited before' },
    ],
  },
  serviceRuns: {
    title: 'Service reminders',
    fields: [
      { name: 'contact_id', type: 'String', label: 'Contact' },
      { name: 'contact_name', type: 'String' },
      { name: 'service_id', type: 'String' },
      { name: 'service_name', type: 'String' },
      { name: 'sequence_id', type: 'String', label: 'Follow-up series' },
      { name: 'sequence_name', type: 'String' },
      { name: 'visit_id', type: 'String' },
      { name: 'visit_at', type: 'Date' },
      { name: 'mode', type: 'String', label: 'api (scheduled messages) | app (WhatsApp to send)' },
      { name: 'series_id', type: 'String', label: 'Scheduled-message series (API)' },
      { name: 'due_json', type: 'String', label: 'When each reminder is due' },
      { name: 'status', type: 'String', label: 'active | restarted | stopped' },
      { name: 'stop_reason', type: 'String' },
      { name: 'stopped_at', type: 'Date' },
      { name: 'kind', type: 'String', label: 'service | visit | milestone | occasion' },
      { name: 'next_due', type: 'Date', label: 'The next message still ahead' },
    ],
  },
  settings: {
    title: 'App settings',
    fields: [
      { name: 'member_id', type: 'String', label: 'Whose setting: a user id, or * for the whole workspace' },
      { name: 'key', type: 'String' },
      { name: 'value_json', type: 'String' },
      { name: 'updated_at', type: 'Date' },
      { name: 'updated_by', type: 'String' },
    ],
  },
  sequences: {
    title: 'Follow-up sequences',
    fields: [
      { name: 'name', type: 'String' },
      { name: 'description', type: 'String' },
      { name: 'channel_id', type: 'String', label: 'WhatsApp channel' },
      { name: 'steps_json', type: 'String', label: 'Steps: template, delay, variable mapping, conditions' },
      { name: 'condition_json', type: 'String', label: 'Keep sending only while the lead matches' },
      { name: 'on_fail', type: 'String', label: 'skip | cancel_series' },
      { name: 'trigger_json', type: 'String', label: 'App-side auto start rule' },
      { name: 'active', type: 'Boolean', default: true },
      { name: 'created_by', type: 'String' },
      { name: 'repeat_json', type: 'String', label: 'After the last step: repeat every … up to … times' },
    ],
  },
  remarks: {
    title: 'Remarks',
    fields: [
      { name: 'contact_id', type: 'String' },
      { name: 'text', type: 'String' },
      { name: 'member_id', type: 'String' },
      { name: 'member_name', type: 'String' },
    ],
  },
  reminders: {
    title: 'Reminders',
    fields: [
      { name: 'contact_id', type: 'String' },
      { name: 'contact_name', type: 'String' },
      { name: 'phone', type: 'String' },
      { name: 'note', type: 'String' },
      { name: 'due_at', type: 'Date' },
      { name: 'member_id', type: 'String' },
      { name: 'member_name', type: 'String' },
      { name: 'done', type: 'Boolean', default: false },
      { name: 'done_at', type: 'Date' },
      { name: 'kind', type: 'String', label: 'call | task | whatsapp (empty means call)' },
    ],
  },
};

export type DataStoreHandle = {
  available: boolean;
  storeId: string;
  collections: Partial<Record<CollectionKey, string>>;
  /** Why it is unavailable, for the setup screen. */
  reason?: string;
  /**
   * What kind of unavailable: `plan` the subscription has no data store (only an
   * upgrade helps), `payment` the wallet couldn't pay for it, `owner` a member
   * waiting for the owner, `setup` no store yet (the owner runs the workspace setup),
   * `error` anything else (offline…: a sync fixes it).
   */
  kind?: 'plan' | 'payment' | 'owner' | 'setup' | 'error';
  /** Each table's declared fields as last seen, so a write never sends one the table lacks. */
  fields?: Partial<Record<CollectionKey, string[]>>;
  /** SCHEMA_SIG when set up: a newer app version (new fields) sets the store up again. */
  schema?: string;
};

/** Changes whenever a table gains a field, so the cached handle is refreshed and the field added. */
const SCHEMA_SIG = (Object.keys(SCHEMAS) as CollectionKey[]).map((k) => `${k}:${SCHEMAS[k].fields.map((f) => f.name).join(',')}`).join('|');

const CACHE_KEY = 'datastore.handle.v1';

/** `undefined` = the active account. Each account has its own store ids. */
type Acct = string | null | undefined;
const keyOf = (acct: Acct) => (acct === undefined ? (activeAccountId() ?? '') : (acct ?? ''));

const memo = new Map<string, DataStoreHandle>();
const inflight = new Map<string, Promise<DataStoreHandle>>();
/** When setup last failed: a plan without a data store is retried after a few minutes, anything else after one. */
const failed = new Map<string, { at: number; final: boolean }>();
const RETRY_AFTER_MS = 60_000;
/** A plan only changes when someone subscribes (which calls resetDataStore), so look again rarely. */
const FINAL_RETRY_AFTER_MS = 5 * 60_000;

/* Change notifications, for the banners: bumps whenever a setup attempt finishes. */
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};
export const onDataStoreChange = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export const dataStoreVersion = () => version;

/**
 * Forgets a failed setup so the next call tries again at once. Call after the
 * plan changes (a subscribe): an earlier "not included" no longer holds.
 */
export const resetDataStore = (acct?: Acct) => {
  const k = keyOf(acct);
  failed.delete(k);
  if (memo.get(k)?.available === false) memo.delete(k);
  emit();
};
/** When a member's account last looked for tables the owner hasn't made yet. */
const lastLook = new Map<string, number>();

/** Whether this login owns the account (only owners create the store and its tables). */
const ownsAccount = (k: string) => {
  const { sessions, activeId } = useAccountsStore.getState();
  return sessions.find((s) => s.id === (k || activeId))?.isOwner ?? true;
};
/** A member's handle missing some tables: look again only after a while. */
const memberMayLook = (k: string) => ownsAccount(k) || Date.now() - (lastLook.get(k) ?? 0) > RETRY_AFTER_MS;

export const cachedHandle = (acct?: Acct): DataStoreHandle | null => {
  const k = keyOf(acct);
  return memo.get(k) ?? readJson<DataStoreHandle>(CACHE_KEY, k || null);
};

/** Find-or-create the store and every collection. Cached after the first success. */
/**
 * The account's data store handle. By default this only *finds* the store and its tables:
 * nothing is created on sign-in or in the background. `{ create: true }` (the owner's
 * explicit workspace setup) creates the store on the `plan` they picked, then the
 * missing tables and newer fields.
 */
export const ensureDataStore = (
  force = false,
  acct?: Acct,
  { create = false, plan }: { create?: boolean; plan?: DataStorePlanChoice } = {},
): Promise<DataStoreHandle> => {
  const k = keyOf(acct);
  const flightKey = create ? `${k}|create` : k;
  const needed = requiredCollections(k || null);
  // No feature of this account stores anything: don't create a data store.
  if (!needed.length) return Promise.resolve({ available: false, storeId: '', collections: {}, reason: 'No feature of this account needs the data store.' });
  if (!force) {
    const cached = cachedHandle(k || null);
    // Not every field there yet (a member can't add them, or adding failed): look again, at most every RETRY_AFTER_MS.
    const current = cached?.schema === SCHEMA_SIG || Date.now() - (lastLook.get(k) ?? 0) < RETRY_AFTER_MS;
    if (cached?.available && current && (needed.every((key) => cached.collections[key]) || !memberMayLook(k))) {
      memo.set(k, cached);
      return Promise.resolve(cached);
    }
  }
  const fail = failed.get(k);
  const known = memo.get(k);
  if (!force && fail && known && !known.available && Date.now() - fail.at < (fail.final ? FINAL_RETRY_AFTER_MS : RETRY_AFTER_MS)) return Promise.resolve(known);
  const running = inflight.get(flightKey);
  if (running) return running;
  const p = (async () => {
    try {
      lastLook.set(k, Date.now());
      const handle = await bootstrap(k || null, ownsAccount(k), create, plan);
      failed.delete(k);
      memo.set(k, handle);
      writeJson(CACHE_KEY, handle, k || null);
      emit();
      return handle;
    } catch (err) {
      const handle: DataStoreHandle = {
        available: false,
        storeId: '',
        collections: {},
        // A low wallet or a full store says so (and is retried); only a subscription without data stores is final.
        reason: isPlanError(err)
          ? isFinalPlanError(err)
            ? `${describeCrmError(err)} Visits, follow-ups and reminders can't be saved to the cloud until the plan includes a data store.`
            : describeCrmError(err)
          : err instanceof NotSetUpYet || err instanceof NoStoreYet
            ? err.message
            : err instanceof Error
            ? err.message
            : 'Data store unavailable',
        kind: isFinalPlanError(err)
          ? 'plan'
          : isPlanError(err)
            ? 'payment'
            : err instanceof NotSetUpYet
              ? 'owner'
              : err instanceof NoStoreYet
                ? 'setup'
                : 'error',
      };
      memo.set(k, handle);
      failed.set(k, { at: Date.now(), final: isFinalPlanError(err) });
      emit();
      return handle;
    } finally {
      inflight.delete(flightKey);
    }
  })();
  inflight.set(flightKey, p);
  return p;
};

/** A member's account whose owner hasn't set the data store up yet. Retried like any other failure. */
class NotSetUpYet extends Error {}
/** The owner's account has no store yet: the workspace setup creates it. */
class NoStoreYet extends Error {}

/**
 * Finds the store and every collection; with `create` (owner only) also creates
 * whatever is missing. Cached after the first success.
 */
const bootstrap = async (acct: string | null, isOwner: boolean, create: boolean, plan?: DataStorePlanChoice): Promise<DataStoreHandle> => {
  const api = crmFor(acct);
  // Only the owner's explicit setup changes the workspace.
  const owner = isOwner && create;
  const found = await api.dataStores.list({ search: STORE_TITLE, rows: 50 });
  let store = found.data.find((s) => s.title === STORE_TITLE);
  if (!store && !isOwner)
    throw new NotSetUpYet('The account owner has not set up the data store yet. Visits and follow-ups can be saved once they set up the workspace.');
  if (!store && !owner) throw new NoStoreYet('The workspace is not set up yet: create the data store in Workspace setup.');
  if (!store) {
    const regions = await api.dataStores.regions().catch(() => ({ data: [] }));
    // The store's plan is bought as part of the create (CPaaS reserves, creates, then charges).
    // No plan picked: CPaaS puts it on its default plan.
    store = await api.dataStores.create({
      title: STORE_TITLE,
      type: 'cloud',
      code: regions.data[0]?.code,
      ...(plan ?? {}),
    });
  }
  const existing = await listAllCollections(store.id, acct);
  const collections: Partial<Record<CollectionKey, string>> = {};
  const fields: Partial<Record<CollectionKey, string[]>> = {};
  // Whether every needed table has every field this version declares.
  let complete = true;
  const needed = new Set(requiredCollections(acct));
  for (const key of Object.keys(SCHEMAS) as CollectionKey[]) {
    const spec = SCHEMAS[key];
    const match = existing.find((c) => c.title === spec.title);
    // Tables of features that are off are neither created nor updated (existing ones stay mapped).
    if (match) fields[key] = match.fields.map((f) => f.name);
    if (!needed.has(key)) {
      if (match) collections[key] = match.id;
      continue;
    }
    if (match) {
      collections[key] = match.id;
      // Add any fields a newer app version introduced. Never drops fields.
      const have = new Set(match.fields.map((f) => f.name));
      const missing = spec.fields.filter((f) => !have.has(f.name));
      if (missing.length && !owner) complete = false;
      if (!owner) continue;
      if (missing.length) {
        const added = await api.dataStoreCollections.update(store.id, match.id, { fields: [...match.fields, ...missing] }).then(
          () => true,
          () => false,
        );
        if (added) fields[key] = [...have, ...missing.map((f) => f.name)];
        else complete = false;
      }
    } else if (owner) {
      const created = await api.dataStoreCollections.create(store.id, {
        title: spec.title,
        fields: spec.fields,
        show_in_chat: key === 'remarks',
        display: { fields: spec.fields.slice(0, 6).map((f) => f.name) },
      });
      collections[key] = created.id;
      fields[key] = spec.fields.map((f) => f.name);
    }
  }
  return { available: true, storeId: store.id, collections, fields, schema: complete ? SCHEMA_SIG : undefined };
};

/**
 * Drops keys the table doesn't declare (yet): the store refuses a whole write
 * over one unknown key. A member's phone can't add fields, so until the owner
 * opens the newer app a new field just stays on the phone.
 */
export const fitRecord = <T extends Record<string, unknown>>(key: CollectionKey, body: T, acct?: Acct): Partial<T> => {
  const known = cachedHandle(keyOf(acct) || null)?.fields?.[key];
  return known ? (Object.fromEntries(Object.entries(body).filter(([k]) => known.includes(k))) as Partial<T>) : body;
};

/** Each table's title in the store, which is how an existing table is recognised. */
export const collectionTitle = (key: CollectionKey) => SCHEMAS[key].title;

const listAllCollections = async (storeId: string, acct: string | null): Promise<DataStoreCollection[]> => {
  const out: DataStoreCollection[] = [];
  let page = 1;
  for (;;) {
    const res = await crmFor(acct).dataStoreCollections.list(storeId, {
      page,
      rows: 100,
    });
    out.push(...res.data);
    if (page >= res.pagination.pages) break;
    page += 1;
  }
  return out;
};

/** Throws when the store is unavailable; repositories catch and fall back. */
export const collectionRef = async (key: CollectionKey, acct?: Acct): Promise<{ storeId: string; collectionId: string }> => {
  let h = await ensureDataStore(false, acct);
  // A feature switched on since the store was set up: add its tables now.
  if (h.available && !h.collections[key] && requiredCollections(keyOf(acct) || null).includes(key) && memberMayLook(keyOf(acct)))
    h = await ensureDataStore(true, acct);
  const collectionId = h.collections[key];
  if (!h.available || !collectionId) throw new DataStoreUnavailable(h.reason ?? 'Data store unavailable');
  return { storeId: h.storeId, collectionId };
};

export class DataStoreUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataStoreUnavailable';
  }
}

/**
 * Drops empty values before a record write. The data store validates field
 * types, and an empty string in a Date (or Number) field fails the whole
 * request with "Request validation failed".
 */
export const cleanRecord = <T extends Record<string, unknown>>(body: T): Partial<T> =>
  Object.fromEntries(Object.entries(body).filter(([, v]) => v !== '' && v !== undefined && v !== null)) as Partial<T>;

/** Gateway requests from bulk reads (Reports, long lists): four at a time across all of them, under the rate limit. */
export const gatewayLimit = createLimiter(4);

/**
 * Every page of a data-store search, in order: page 1 first (for the page
 * count), then the rest together through `gatewayLimit`. At most `maxPages`
 * of 100; `capped` says there were more.
 */
export const searchAll = async (
  key: CollectionKey,
  query: Omit<SearchDataStoreRecordsInput, 'page' | 'rows'>,
  opts: { maxPages?: number; acct?: Acct } = {},
): Promise<{ rows: Record<string, unknown>[]; capped: boolean }> => {
  const { storeId, collectionId } = await collectionRef(key, opts.acct);
  const api = crmFor(opts.acct).dataStoreRecords;
  const max = opts.maxPages ?? 20;
  const page = (n: number) => gatewayLimit(() => api.search(storeId, collectionId, { ...query, page: n, rows: 100 }));
  const first = await page(1);
  const pages = Math.min(first.pagination.pages, max);
  const rows = [...(first.data as Record<string, unknown>[])];
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => page(i + 2)));
  for (const res of rest) rows.push(...(res.data as Record<string, unknown>[]));
  return { rows, capped: first.pagination.pages > max };
};
