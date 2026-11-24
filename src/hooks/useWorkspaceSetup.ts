/**
 * Whether the active workspace has what the app runs on: every lead custom
 * field, and the cloud data store with the tables its features need. Nothing
 * is created automatically; when something is missing, the owner is sent to the
 * setup journey (`/workspace-setup`) after signing in.
 */
import { Redirect, usePathname, type Href } from 'expo-router';
import { createElement, useSyncExternalStore } from 'react';

import { useDataStoreHandle } from '@/components/SetupBanner';
import { useFields } from '@/hooks/queries';
import { requiredCollections } from '@/services/crm/datastore';
import { LEAD_FIELDS } from '@/services/crm/schema';
import { useAccountsStore } from '@/stores/accounts';
import { useIsOwner } from '@/stores/auth';

export const WORKSPACE_SETUP_PATH = '/workspace-setup';

/**
 * - `ok`: the store and every needed table exist (or no feature needs a store)
 * - `missing`: no store yet: step 2 picks a plan and creates it
 * - `tables`: the store exists but a table is missing (a feature switched on later)
 * - `refused`: CPaaS refuses a store (the subscription has none, or the wallet is short)
 * - `unknown`: not looked yet, or offline
 */
export type StoreState = 'ok' | 'missing' | 'tables' | 'refused' | 'unknown';

export type WorkspaceSetupStatus = {
  /** Both checks have an answer. */
  known: boolean;
  /** How many lead fields are missing (0 while unknown). */
  missingFields: number;
  fieldsKnown: boolean;
  store: StoreState;
  complete: boolean;
};

export function useWorkspaceSetupStatus(): WorkspaceSetupStatus {
  const acct = useAccountsStore((s) => s.activeId);
  const fields = useFields();
  const ds = useDataStoreHandle();

  const fieldsKnown = !!fields.data;
  const present = new Set((fields.data ?? []).map((f) => f.slug));
  const missingFields = fieldsKnown ? LEAD_FIELDS.filter((f) => !present.has(f.slug)).length : 0;

  const needed = acct ? requiredCollections(acct) : [];
  let store: StoreState = 'unknown';
  if (!needed.length) store = 'ok';
  else if (!ds) store = 'unknown';
  else if (ds.available) store = needed.every((k) => ds.collections[k]) ? 'ok' : 'tables';
  else if (ds.kind === 'setup') store = 'missing';
  else if (ds.kind === 'plan' || ds.kind === 'payment') store = 'refused';

  const known = fieldsKnown && store !== 'unknown';
  return { known, missingFields, fieldsKnown, store, complete: known && missingFields === 0 && store === 'ok' };
}

/* "Skip for now": asked again on the next sign-in or app start, not on every screen change. */
const skipped = new Set<string>();
let skipVersion = 0;
const skipListeners = new Set<() => void>();
export const skipWorkspaceSetup = (acct: string | null | undefined) => {
  if (!acct) return;
  skipped.add(acct);
  skipVersion += 1;
  skipListeners.forEach((l) => l());
};
const subscribeSkip = (l: () => void) => {
  skipListeners.add(l);
  return () => void skipListeners.delete(l);
};

/** Where the owner should be sent instead of the screen they asked for, or null. */
export function useWorkspaceSetupRedirect(): Href | null {
  const pathname = usePathname();
  const acct = useAccountsStore((s) => s.activeId);
  const isOwner = useIsOwner();
  const status = useWorkspaceSetupStatus();
  useSyncExternalStore(subscribeSkip, () => skipVersion, () => skipVersion);
  if (!isOwner || !acct || skipped.has(acct) || pathname === WORKSPACE_SETUP_PATH) return null;
  return status.known && !status.complete ? (WORKSPACE_SETUP_PATH as Href) : null;
}

/** Rendered by the signed-in layouts (after their own guards): sends the owner to the setup journey when needed. */
export function WorkspaceSetupGate() {
  const href = useWorkspaceSetupRedirect();
  return href ? createElement(Redirect, { href }) : null;
}
