/**
 * Suggested roles: ready-made permission sets an owner can add from the roles
 * screen in one tap (or open in the editor and adjust first).
 *
 * A preset is written as feature → verbs (the keys the CPaaS docs publish,
 * e.g. `CRM.CONTACT` + `UPDATE`) and resolved against the live catalogue, so a
 * feature this account's catalogue doesn't list is simply left out instead of
 * being rejected by the server.
 *
 * A preset counts as added once a role with its title exists (any case), so it
 * is not offered twice.
 */
import type { CreateRolePayload, DataScope, PermissionCatalogue, Role } from '@ab-ecosystem/sso';

import { P, type AppPermission } from '@/lib/permissions';
import { expandPermissions } from './client';

export type PresetId = 'sales' | 'followup' | 'support' | 'partialAdmin';

/** Feature key → verbs. `'*'` is every verb the feature has. */
type Rules = Record<string, string[] | '*'>;

export type RolePreset = {
  id: PresetId;
  /** Saved as the role's name. Kept in English: it is workspace data every member sees, and what `presetExists` matches on. */
  title: string;
  description: string;
  dataScope: DataScope;
  rules: Rules;
  /** Every action in the catalogue except these verbs (on top of `rules`). */
  allExcept?: string[];
  /** The app's own permissions the role starts with (see `APP_PERMISSIONS`). */
  app: AppPermission[];
};

const READ = ['LIST', 'READ'];
const WORK = ['LIST', 'READ', 'CREATE', 'UPDATE'];

/** What any member needs for the app itself to work: remarks, reminders, settings, fields, tags, teammates, push. */
const ESSENTIALS: Rules = {
  'CRM.DATASTORE': READ,
  'CRM.DATASTORE.COLLECTION': READ,
  'CRM.DATASTORE.RECORD': WORK,
  'CRM.CONTACT.FIELD': READ,
  'CRM.CONTACT.TAG': READ,
  'CRM.CHAT.CANNED_REPLY': READ,
  'CRM.DEVICE': ['LIST', 'CREATE', 'DELETE'],
  TEAM: ['LIST', 'VIEW'],
};

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'sales',
    title: 'Sales person',
    description: 'Works their own leads: adds and updates contacts, chats on WhatsApp and schedules follow-ups.',
    dataScope: 'own',
    app: [P.app.visits, P.app.importLeads],
    rules: {
      ...ESSENTIALS,
      'CRM.CONTACT': WORK,
      'CRM.CONTACT.TAG': ['LIST', 'READ', 'CREATE'],
      'CRM.CONTACT.SEGMENT': READ,
      'CRM.CHAT': ['LIST', 'READ', 'SEND', 'UPDATE'],
      'CRM.CHAT.SCHEDULED_MESSAGE': WORK,
      'CRM.TEMPLATE': READ,
      'CRM.CAMPAIGN': READ,
      'CRM.CHANNEL.WHATSAPP': READ,
    },
  },
  {
    id: 'followup',
    title: 'Follow-up agent',
    description: 'Follows up on the leads assigned to them on WhatsApp, logs remarks and sends follow-up messages.',
    dataScope: 'own',
    app: [P.app.visits],
    rules: {
      ...ESSENTIALS,
      'CRM.CONTACT': ['LIST', 'READ', 'UPDATE'],
      'CRM.CONTACT.SEGMENT': READ,
      'CRM.CHAT': ['LIST', 'READ', 'SEND'],
      'CRM.CHAT.SCHEDULED_MESSAGE': ['LIST', 'READ', 'CREATE'],
      'CRM.TEMPLATE': READ,
    },
  },
  {
    id: 'support',
    title: 'Support',
    description: 'Sends WhatsApp templates to customers across the whole workspace and updates contacts.',
    dataScope: 'all',
    app: [P.app.visits],
    rules: {
      ...ESSENTIALS,
      'CRM.CONTACT': ['LIST', 'READ', 'UPDATE'],
      'CRM.CHAT': ['LIST', 'READ', 'SEND', 'UPDATE', 'TRANSFER'],
      'CRM.CHAT.SCHEDULED_MESSAGE': ['LIST', 'READ', 'CREATE'],
      'CRM.TEMPLATE': READ,
      'CRM.CHANNEL.WHATSAPP': READ,
    },
  },
  {
    id: 'partialAdmin',
    title: 'Partial admin',
    description: 'Can see, create and edit everything in the workspace, but cannot delete anything.',
    dataScope: 'all',
    app: Object.values(P.app).filter((k) => k !== P.app.workspaceSettings),
    rules: ESSENTIALS,
    allExcept: ['DELETE'],
  },
];

const verbOf = (key: string, verb: string) => (verb || key.slice(key.lastIndexOf('.') + 1)).toUpperCase();

/** The preset's action keys that exist in this catalogue, expanded over `implies`. */
export const resolvePreset = (catalogue: PermissionCatalogue, preset: RolePreset): string[] => {
  const keys: string[] = [];
  for (const g of catalogue.groups ?? [])
    for (const f of g.features)
      for (const a of f.actions) {
        const verb = verbOf(a.key, a.verb);
        const rule = preset.rules[f.key];
        const byRule = rule === '*' || (Array.isArray(rule) && rule.includes(verb));
        const byAll = !!preset.allExcept && !preset.allExcept.includes(verb);
        if (byRule || byAll) keys.push(a.key);
      }
  return expandPermissions(catalogue, keys);
};

export const presetPayload = (catalogue: PermissionCatalogue, preset: RolePreset): CreateRolePayload => ({
  title: preset.title,
  description: preset.description,
  permission: resolvePreset(catalogue, preset),
  data_scope: preset.dataScope,
});

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const presetExists = (roles: Role[], preset: RolePreset) => roles.some((r) => sameName(r.title, preset.title));
