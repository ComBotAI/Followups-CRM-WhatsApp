/**
 * Visits settings, per account (workspace): which industry template it was set
 * up from, the business name and review link used in messages, and when a
 * guest counts as a Regular or a VIP. Synced to the team through cloud
 * settings (workspace scope).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Tier } from '@/services/crm/schema';
import { kvStorage } from '@/services/storage';
import { useAccountsStore } from './accounts';

export type VisitsConfig = {
  /** Industry template key (`restaurant`, `salon`…), or null before setup. */
  industry: string | null;
  /** Shown in messages as [[business]]; falls back to the workspace name. */
  business: string;
  /** Google (or any) review page, shown in messages as [[review_link]]. */
  reviewLink: string;
  /** Visits from which a guest is a Regular, and a VIP. */
  regularAt: number;
  vipAt: number;
};

export const DEFAULT_VISITS: VisitsConfig = { industry: null, business: '', reviewLink: '', regularAt: 3, vipAt: 10 };

type State = {
  byAccount: Record<string, VisitsConfig>;
  set: (accountId: string, patch: Partial<VisitsConfig>) => void;
  forget: (accountId: string) => void;
};

export const useVisitsStore = create<State>()(
  persist(
    (set, get) => ({
      byAccount: {},
      set: (accountId, patch) => set({ byAccount: { ...get().byAccount, [accountId]: { ...DEFAULT_VISITS, ...get().byAccount[accountId], ...patch } } }),
      forget: (accountId) => {
        const { [accountId]: _gone, ...rest } = get().byAccount;
        set({ byAccount: rest });
      },
    }),
    { name: 'visits', storage: createJSONStorage(() => kvStorage) },
  ),
);

/** An account's Visits settings (default: the active account). */
export const visitsConfig = (accountId?: string | null): VisitsConfig => {
  const id = accountId === undefined ? useAccountsStore.getState().activeId : accountId;
  return { ...DEFAULT_VISITS, ...(id ? useVisitsStore.getState().byAccount[id] : undefined) };
};

export const useVisitsConfig = (): VisitsConfig => {
  const id = useAccountsStore((s) => s.activeId);
  const saved = useVisitsStore((s) => (id ? s.byAccount[id] : undefined));
  return { ...DEFAULT_VISITS, ...saved };
};

/** A guest's tier from their number of visits. */
export const tierFor = (visits: number, c: Pick<VisitsConfig, 'regularAt' | 'vipAt'> = visitsConfig()): Tier =>
  visits >= c.vipAt ? 'VIP' : visits >= c.regularAt ? 'Regular' : 'New';
