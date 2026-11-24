/**
 * Data store plans, limited to the tenure of the account's main plan.
 *
 * A workspace whose main plan runs for 30 days can only buy a data store for
 * 30 days; one on 360 days only for 360 days. A paid plan keeps only that
 * cycle and is dropped when it doesn't offer it. Free plans have no tenure and
 * stay. When nothing is left, the store can't be created from the app and the
 * owner is told to contact their admin.
 */
import type { DataStorePlanCatalogue } from '@ab-ecosystem/cpaas';

import { getSubscriptionTenure } from '@/services/sso/client';
import { activeAccountId, tokenFor } from '@/stores/accounts';
import { listDataStorePlans } from './datastore';

export type TenuredPlanCatalogue = DataStorePlanCatalogue & {
  /** The main plan's tenure, normalised ("30D", "360D", "LTD"), or null when the subscription names none. */
  tenure: string | null;
  /** CPaaS offers plans, but none for this tenure: the store can't be created here. */
  noMatch: boolean;
};

/** "30D", "30", "30 days", " 30d " → "30D"; "LTD" / "lifetime" → "LTD". */
export const normaliseTenure = (cycle: string): string => {
  const s = cycle.trim().toUpperCase().replace(/\s+/g, '');
  if (s === 'LTD' || s.startsWith('LIFE')) return 'LTD';
  const m = s.match(/^(\d+)(D|DAY|DAYS)?$/);
  return m ? `${Number(m[1])}D` : s;
};

export const restrictToTenure = (catalogue: DataStorePlanCatalogue, tenure: string | null): TenuredPlanCatalogue => {
  const t = tenure ? normaliseTenure(tenure) : null;
  const plans = catalogue.plans.flatMap((p) => {
    if (!p.paid) return [p];
    const cycles = t ? p.cycles.filter((c) => normaliseTenure(c) === t) : [];
    if (!cycles.length) return [];
    const pricing = Object.fromEntries(Object.entries(p.pricing ?? {}).filter(([c]) => cycles.includes(c)));
    return [{ ...p, cycles, pricing }];
  });
  return { ...catalogue, plans, tenure: t, noMatch: catalogue.plans.length > 0 && plans.length === 0 };
};

/** The plan picker's catalogue for this account, already limited to its main plan's tenure. */
export const listTenuredPlans = async (acct?: string | null): Promise<TenuredPlanCatalogue> => {
  const id = acct ?? activeAccountId();
  const [catalogue, tenure] = await Promise.all([listDataStorePlans(id), getSubscriptionTenure(tokenFor(id))]);
  const out = restrictToTenure(catalogue, tenure);
  if (__DEV__)
    console.log(
      `[storePlans] main plan tenure=${tenure ?? 'none'} → ${out.plans.map((p) => `${p.id}:${p.paid ? p.cycles.join('/') : 'free'}`).join(', ') || 'no plans'}`,
    );
  return out;
};
