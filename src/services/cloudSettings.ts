/**
 * Settings in the cloud: each account's settings live in that account's own
 * data store ("App settings"), so a new phone, the web app or a reinstall gets
 * them back on sign-in, and later changes keep flowing to every device.
 *
 * Two scopes, one record per setting:
 * - workspace (member_id "*"): how the business works — WhatsApp
 *   mode and channel, template variable mappings, lead assignment, Visits setup. Shared by the team;
 *   only the owner, or a member whose role has the matching app permission
 *   (`WORKSPACE_PERMISSION`), writes them.
 * - personal (member_id = the user): theme, language, country and
 *   account colour.
 * Always on for every account.
 * Phone-only things (phone contacts and their auto-add, which depends on what
 * is already on that phone) stay on the phone.
 *
 * Newest change wins. A device pulls before it ever pushes, so a fresh install
 * never overwrites the cloud with its defaults.
 */
import { AppState } from 'react-native';

import { readJson, writeJson } from '@/services/storage';
import { tokenFor, useAccountsStore } from '@/stores/accounts';
import { useSettingsStore } from '@/stores/settings';
import { useWhatsAppStore } from '@/stores/whatsapp';
import { useVisitsStore, type VisitsConfig } from '@/stores/visits';
import { CrmApiError, crmFor } from './crm/client';
import { P } from '@/lib/permissions';
import { cleanRecord, collectionRef, requiredCollections } from './crm/datastore';
import { canInAccount } from './crm/rolePermissions';

type Scope = 'workspace' | 'personal';
type Def = { key: string; scope: Scope; read: (acct: string) => unknown; write: (acct: string, value: unknown) => void };

// Keys of settings kept in per-account storage (see their own modules).
const ASSIGNMENT_RULE = 'assignment.rule.v1';

/** Who may change a workspace setting besides the owner: lead routing has its own, the rest are workspace settings. */
const WORKSPACE_PERMISSION: Record<string, string> = { assignment: P.app.routing };
const mayWrite = (def: Def, acct: string) => def.scope === 'personal' || canInAccount(acct, WORKSPACE_PERMISSION[def.key] ?? P.app.workspaceSettings);

const DEFS: Def[] = [
  {
    key: 'whatsapp',
    scope: 'workspace',
    read: (acct) => useWhatsAppStore.getState().byAccount[acct],
    write: (acct, v) => useWhatsAppStore.getState().set(acct, v as never),
  },
  {
    key: 'whatsapp.mappings',
    scope: 'workspace',
    read: (acct) => {
      const prefix = `${acct}|`;
      const own = Object.entries(useWhatsAppStore.getState().mappings).filter(([k]) => k.startsWith(prefix));
      return own.length ? Object.fromEntries(own.map(([k, m]) => [k.slice(prefix.length), m])) : undefined;
    },
    write: (acct, v) => {
      const mappings = { ...useWhatsAppStore.getState().mappings };
      for (const [templateId, m] of Object.entries(v as Record<string, never>)) mappings[`${acct}|${templateId}`] = m;
      useWhatsAppStore.setState({ mappings });
    },
  },
  {
    key: 'visits',
    scope: 'workspace',
    read: (acct) => useVisitsStore.getState().byAccount[acct],
    write: (acct, v) => useVisitsStore.getState().set(acct, v as Partial<VisitsConfig>),
  },
  {
    key: 'country',
    scope: 'workspace',
    read: (acct) => useSettingsStore.getState().countryByAccount[acct],
    write: (acct, v) => useSettingsStore.getState().setAccountCountry(acct, v as never),
  },
  { key: 'assignment', scope: 'workspace', read: (acct) => readJson(ASSIGNMENT_RULE, acct) ?? undefined, write: (acct, v) => writeJson(ASSIGNMENT_RULE, v, acct) },
  {
    key: 'prefs',
    scope: 'personal',
    read: () => {
      const s = useSettingsStore.getState();
      return { theme: s.theme, language: s.language, country: s.country };
    },
    write: (_acct, v) => {
      const p = v as Partial<ReturnType<typeof useSettingsStore.getState>>;
      useSettingsStore.setState(p);
    },
  },
  {
    key: 'accountColor',
    scope: 'personal',
    read: (acct) => useAccountsStore.getState().sessions.find((s) => s.id === acct)?.color,
    write: (acct, v) => useAccountsStore.getState().setColor(acct, String(v)),
  },
];

/** JSON with sorted keys, so the same settings always compare equal. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );

type Meta = Record<string, { hash: string; ts: number; id: string }>;
const META = 'cloudsettings.meta.v1';
const meta = (acct: string): Meta => readJson<Meta>(META, acct) ?? {};
const saveMeta = (acct: string, m: Meta) => writeJson(META, m, acct);

const signedInSessions = () => useAccountsStore.getState().sessions.filter((s) => !!tokenFor(s.id));
const sessionOf = (acct: string) => useAccountsStore.getState().sessions.find((s) => s.id === acct);
const memberFor = (def: Def, acct: string) => (def.scope === 'workspace' ? '*' : (sessionOf(acct)?.userId ?? ''));

const pulled = new Set<string>();
const pulling = new Map<string, Promise<void>>();
const lastPull = new Map<string, number>();

/**
 * Brings an account's settings down and applies the ones newer than this
 * device's copy, then uploads anything this device has that the cloud lacks.
 */
/** Settings sync is always on for every account (it needs the data store's settings table). */
const syncAny = (acct: string) => requiredCollections(acct).includes('settings');
const syncsDef = (_def: Def, acct: string) => syncAny(acct);

export const pullSettings = (acct: string): Promise<void> => {
  if (!syncAny(acct)) return Promise.resolve();
  const running = pulling.get(acct);
  if (running) return running;
  const p = (async () => {
    const me = sessionOf(acct)?.userId;
    if (!me) return;
    const { storeId, collectionId } = await collectionRef('settings', acct);
    const res = await crmFor(acct).dataStoreRecords.search(storeId, collectionId, { filter: { member_id: { $in: [me, '*'] } }, rows: 100 });
    const m = meta(acct);
    for (const def of DEFS) {
      if (!syncsDef(def, acct)) continue;
      const member = memberFor(def, acct);
      const rec = res.data.find((r) => r.key === def.key && r.member_id === member);
      if (!rec) continue;
      const json = String(rec.value_json ?? '');
      const ts = Date.parse(String(rec.updated_at ?? '')) || 0;
      const local = m[def.key];
      // Changed here and not uploaded yet (offline): that newer change wins and goes up next.
      const unpushed = !!local && stable(def.read(acct)) !== local.hash;
      if (!local || (ts > local.ts && !unpushed)) {
        try {
          if (json) def.write(acct, JSON.parse(json));
          m[def.key] = { hash: stable(def.read(acct)), ts, id: String(rec.id) };
        } catch {
          // A value this app version can't read: leave the local one.
        }
      } else m[def.key] = { ...local, id: String(rec.id) };
    }
    saveMeta(acct, m);
    pulled.add(acct);
    lastPull.set(acct, Date.now());
    await pushSettings(acct);
  })().finally(() => pulling.delete(acct));
  pulling.set(acct, p);
  return p;
};

const pushChain = new Map<string, Promise<void>>();

/**
 * Uploads the settings that changed on this device since they were last synced.
 * One push at a time per account: two at once both found no record id and
 * inserted, leaving duplicate rows for one setting.
 */
const pushSettings = (acct: string): Promise<void> => {
  const next = (pushChain.get(acct) ?? Promise.resolve()).catch(() => undefined).then(() => pushNow(acct));
  pushChain.set(acct, next);
  return next;
};

/** Signing out: this run forgets the account, so signing back in pulls before it pushes again. */
export const forgetCloudSettings = (acct: string) => {
  pulled.delete(acct);
  lastPull.delete(acct);
  clearTimeout(timers.get(acct));
  timers.delete(acct);
  pushChain.delete(acct);
};

const pushNow = async (acct: string) => {
  if (!pulled.has(acct) || !sessionOf(acct) || !syncAny(acct)) return;
  const m = meta(acct);
  let ref: { storeId: string; collectionId: string } | null = null;
  for (const def of DEFS) {
    if (!syncsDef(def, acct)) continue;
    const value = def.read(acct);
    if (value === undefined || value === null) continue;
    const hash = stable(value);
    const known = m[def.key];
    if (known?.hash === hash) continue;
    // Workspace settings are written only by those allowed to (a member's local change stays on their phone).
    if (!mayWrite(def, acct)) continue;
    ref ??= await collectionRef('settings', acct);
    const record = cleanRecord({ member_id: memberFor(def, acct), key: def.key, value_json: hash, updated_at: new Date().toISOString(), updated_by: sessionOf(acct)?.userId });
    const api = crmFor(acct).dataStoreRecords;
    let id = known?.id ?? '';
    if (id)
      await api.update(ref.storeId, ref.collectionId, id, { record }).catch((err: unknown) => {
        // The record was deleted on the server: write it again rather than fail every push.
        if (!(err instanceof CrmApiError && err.status === 404)) throw err;
        id = '';
      });
    if (!id) id = (await api.insert(ref.storeId, ref.collectionId, { record })).ids[0] ?? '';
    m[def.key] = { hash, ts: Date.now(), id };
    saveMeta(acct, m);
  }
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Something changed: upload it shortly (changes in a burst go up together). */
export const settingsChanged = (acct?: string | null) => {
  const targets = acct ? [acct] : [...pulled];
  for (const a of targets) {
    clearTimeout(timers.get(a));
    timers.set(
      a,
      setTimeout(() => void pushSettings(a).catch(() => undefined), 2000),
    );
  }
};

/** Whether a workspace setting is locked for this user (their role may not change it). */
export const isWorkspaceLocked = (key: string, acct: string | null | undefined): boolean => {
  const def = DEFS.find((d) => d.key === key);
  if (!acct || !def || !syncsDef(def, acct)) return false;
  return !mayWrite(def, acct);
};

let started = false;

/** Keeps every signed-in account in step: pulls now, on return to the app, and pushes on change. */
export const startCloudSettings = () => {
  if (started) return;
  started = true;
  // Signed-in accounts only: an expired one has no token, and its pull would fail on every store change.
  for (const s of signedInSessions()) void pullSettings(s.id).catch(() => undefined);
  const changed = () => {
    settingsChanged();
    // Sync switched on for an account: bring its settings down (then push) once.
    for (const s of signedInSessions()) if (syncAny(s.id) && !pulled.has(s.id) && !pulling.has(s.id)) void pullSettings(s.id).catch(() => undefined);
  };
  useWhatsAppStore.subscribe(changed);
  useVisitsStore.subscribe(changed);
  useSettingsStore.subscribe(changed);
  useAccountsStore.subscribe(changed);
  AppState.addEventListener('change', (st) => {
    if (st !== 'active') return;
    for (const s of signedInSessions())
      if (Date.now() - (lastPull.get(s.id) ?? 0) > 5 * 60_000) void pullSettings(s.id).catch(() => undefined);
  });
};
