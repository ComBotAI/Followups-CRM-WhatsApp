/**
 * The app's own permissions per role (see `APP_PERMISSIONS`), one record per
 * role in the data store's "Role permissions" table. The owner writes them
 * from the role screen; each member reads their own role's record and keeps a
 * copy on the phone, so options don't flicker on a cold start or offline.
 *
 * A role with no record (made outside the app, or never edited here) gets
 * `DEFAULT_APP_PERMISSIONS`. This is the app hiding what a role lacks: the
 * CPaaS server does not know these keys.
 */
import { DEFAULT_APP_PERMISSIONS } from '@/lib/permissions';
import { readJson, writeJson } from '@/services/storage';
import { useAccountsStore } from '@/stores/accounts';
import { crmFor } from './client';
import { cleanRecord, collectionRef } from './datastore';

type Acct = string | null | undefined;
const CACHE_KEY = 'appperms.mine.v1';

const parse = (raw: unknown): string[] =>
  String(raw ?? '')
    .split(',')
    .map((k) => k.trim().toUpperCase())
    .filter(Boolean);

const findRecord = async (roleId: string, acct: Acct) => {
  const { storeId, collectionId } = await collectionRef('rolePermissions', acct);
  const res = await crmFor(acct).dataStoreRecords.search(storeId, collectionId, { filter: { role_id: roleId }, rows: 1 });
  const rec = res.data[0] as { id?: string; _id?: string; permissions?: unknown } | undefined;
  return { storeId, collectionId, id: rec ? String(rec.id ?? rec._id ?? '') : '', permissions: rec ? parse(rec.permissions) : null };
};

/** The role's app permissions as saved, or `null` when the owner never set them. */
export const fetchRoleAppPermissions = async (roleId: string, acct?: Acct): Promise<string[] | null> => (await findRecord(roleId, acct)).permissions;

/** Owner: saves a role's app permissions (the whole set). */
export const saveRoleAppPermissions = async (roleId: string, roleTitle: string, permissions: string[], acct?: Acct) => {
  const found = await findRecord(roleId, acct);
  const list = [...new Set(permissions)].join(',');
  const record = cleanRecord({ role_id: roleId, role_title: roleTitle, permissions: list, updated_on: new Date().toISOString() });
  const api = crmFor(acct).dataStoreRecords;
  // Every permission removed: cleanRecord drops the empty list, and an update only sets what it is
  // sent, so the old list stayed. `null` clears it, which reads back as no permissions.
  if (found.id) await api.update(found.storeId, found.collectionId, found.id, { record: list ? record : { ...record, permissions: null } });
  else await api.insert(found.storeId, found.collectionId, { record });
};

/** Owner: drops a deleted role's record. */
export const deleteRoleAppPermissions = async (roleId: string, acct?: Acct) => {
  const found = await findRecord(roleId, acct);
  if (found.id) await crmFor(acct).dataStoreRecords.remove(found.storeId, found.collectionId, found.id);
};

/** The signed-in member's app permissions, from their role (no role → the defaults). Cached per account. */
export const fetchMyAppPermissions = async (roleId: string, acct: Acct): Promise<string[]> => {
  const mine = (roleId ? await fetchRoleAppPermissions(roleId, acct) : null) ?? DEFAULT_APP_PERMISSIONS;
  writeJson(CACHE_KEY, mine, acct ?? null);
  return mine;
};

export const cachedMyAppPermissions = (acct: Acct): string[] | null => readJson<string[]>(CACHE_KEY, acct ?? null);

/**
 * Outside React (cloud settings, background work): whether this login may do
 * it. Owners may; a member goes by the last copy of their role's permissions.
 */
export const canInAccount = (acct: string, permission: string): boolean => {
  const session = useAccountsStore.getState().sessions.find((s) => s.id === acct);
  // An account not signed in on this phone gets nothing; an owner gets everything.
  if (!session) return false;
  if (session.isOwner) return true;
  return (cachedMyAppPermissions(acct) ?? DEFAULT_APP_PERMISSIONS).includes(permission);
};
