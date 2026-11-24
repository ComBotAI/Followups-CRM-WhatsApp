/**
 * WhatsApp sending preference, per account.
 *
 * - `phone`: the WhatsApp button opens WhatsApp on this phone (wa.me link).
 * - `api`: messages go out through the account's WhatsApp Business API
 *   channel in CPaaS, as approved templates with variables filled from the lead.
 *
 * Each signed-in account has its own choice and channel, since channels
 * belong to a workspace.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '@/services/storage';
import { useAccountsStore } from './accounts';

export type WhatsAppMode = 'phone' | 'api';

export type WhatsAppConfig = {
  mode: WhatsAppMode;
  /** CPaaS channel id used for API sends. */
  channelId: string | null;
  channelName: string;
};

/** How one template variable gets its value: a lead field, or typed text that may embed `[[field]]` tokens. */
export type VariableSource = { kind: 'field'; key: string } | { kind: 'text'; value: string };

const RECENT_MAX = 5;

const DEFAULT: WhatsAppConfig = { mode: 'phone', channelId: null, channelName: '' };

type State = {
  byAccount: Record<string, WhatsAppConfig>;
  /** Remembered variable mappings: `${accountId}|${templateId}` → slot → source. */
  mappings: Record<string, Record<string, VariableSource>>;
  /** Templates this device sent most recently, per account (newest first). */
  recentTemplates: Record<string, string[]>;
  noteTemplate: (accountId: string, templateId: string) => void;
  set: (accountId: string, patch: Partial<WhatsAppConfig>) => void;
  setMapping: (accountId: string, templateId: string, mapping: Record<string, VariableSource>) => void;
  forget: (accountId: string) => void;
};

export const useWhatsAppStore = create<State>()(
  persist(
    (set, get) => ({
      byAccount: {},
      mappings: {},
      recentTemplates: {},
      noteTemplate: (accountId, templateId) =>
        set({
          recentTemplates: {
            ...get().recentTemplates,
            [accountId]: [templateId, ...(get().recentTemplates[accountId] ?? []).filter((id) => id !== templateId)].slice(0, RECENT_MAX),
          },
        }),
      set: (accountId, patch) => set({ byAccount: { ...get().byAccount, [accountId]: { ...DEFAULT, ...get().byAccount[accountId], ...patch } } }),
      setMapping: (accountId, templateId, mapping) => set({ mappings: { ...get().mappings, [`${accountId}|${templateId}`]: mapping } }),
      forget: (accountId) => {
        const { [accountId]: _gone, ...rest } = get().byAccount;
        set({ byAccount: rest });
      },
    }),
    { name: 'whatsapp', storage: createJSONStorage(() => kvStorage) },
  ),
);

/** The active account's WhatsApp config. */
export const useWhatsAppConfig = (): WhatsAppConfig => {
  const id = useAccountsStore((s) => s.activeId);
  return useWhatsAppStore((s) => (id ? (s.byAccount[id] ?? DEFAULT) : DEFAULT));
};

/** An account's WhatsApp settings (default: the active account). */
export const whatsAppConfig = (accountId?: string | null): WhatsAppConfig => {
  const id = accountId === undefined ? useAccountsStore.getState().activeId : accountId;
  return (id && useWhatsAppStore.getState().byAccount[id]) || DEFAULT;
};

export const savedMapping = (accountId: string | null, templateId: string) =>
  (accountId && useWhatsAppStore.getState().mappings[`${accountId}|${templateId}`]) || {};

const NO_RECENT: string[] = [];
/** The account's recently sent template ids, newest first. */
export const useRecentTemplates = (accountId: string | null) => useWhatsAppStore((s) => (accountId ? (s.recentTemplates?.[accountId] ?? NO_RECENT) : NO_RECENT));
