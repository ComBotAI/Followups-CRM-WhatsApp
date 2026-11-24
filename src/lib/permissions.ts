/**
 * The permission keys the app checks before showing an option, the same keys
 * the CPaaS server enforces on each call (node_modules/@ab-ecosystem/cpaas/docs).
 * Hiding is a courtesy: the server refuses regardless.
 *
 * Check with `useCan(P.contacts.delete)` from `@/stores/auth`.
 */
export const P = {
  contacts: {
    list: 'CRM.CONTACT.LIST',
    create: 'CRM.CONTACT.CREATE',
    update: 'CRM.CONTACT.UPDATE',
    delete: 'CRM.CONTACT.DELETE',
    export: 'CRM.CONTACT.EXPORT',
  },
  tags: { create: 'CRM.CONTACT.TAG.CREATE', delete: 'CRM.CONTACT.TAG.DELETE' },
  segments: { create: 'CRM.CONTACT.SEGMENT.CREATE', delete: 'CRM.CONTACT.SEGMENT.DELETE' },
  chats: {
    list: 'CRM.CHAT.LIST',
    send: 'CRM.CHAT.SEND',
    update: 'CRM.CHAT.UPDATE',
    transfer: 'CRM.CHAT.TRANSFER',
    delete: 'CRM.CHAT.DELETE',
  },
  quickReplies: { create: 'CRM.CHAT.CANNED_REPLY.CREATE', update: 'CRM.CHAT.CANNED_REPLY.UPDATE', delete: 'CRM.CHAT.CANNED_REPLY.DELETE' },
  scheduled: { create: 'CRM.CHAT.SCHEDULED_MESSAGE.CREATE', send: 'CRM.CHAT.SCHEDULED_MESSAGE.SEND', delete: 'CRM.CHAT.SCHEDULED_MESSAGE.DELETE' },
  campaigns: {
    list: 'CRM.CAMPAIGN.LIST',
    create: 'CRM.CAMPAIGN.CREATE',
    update: 'CRM.CAMPAIGN.UPDATE',
    send: 'CRM.CAMPAIGN.SEND',
    delete: 'CRM.CAMPAIGN.DELETE',
  },
  templates: { create: 'CRM.TEMPLATE.CREATE', update: 'CRM.TEMPLATE.UPDATE', delete: 'CRM.TEMPLATE.DELETE' },
  team: { list: 'TEAM.LIST' },
  /** Listing any channel at all (each type is its own key). */
  channelsAny: ['CRM.CHANNEL.WHATSAPP.LIST', 'CRM.CHANNEL.SMS.LIST', 'CRM.CHANNEL.RCS.LIST'],
  /** This app's own permissions (see `APP_PERMISSIONS`). */
  app: {
    importLeads: 'APP.LEAD.IMPORT',
    routing: 'APP.LEAD_ROUTING.MANAGE',
    series: 'APP.FOLLOWUP_SERIES.MANAGE',
    services: 'APP.SERVICE.MANAGE',
    visits: 'APP.SERVICE.VISIT',
    reports: 'APP.REPORTS.VIEW',
    workspaceSettings: 'APP.SETTINGS.WORKSPACE',
  },
} as const;

export type AppPermission = (typeof P.app)[keyof typeof P.app];
type AppGroup = { id: 'leads' | 'followups' | 'services' | 'settings'; keys: AppPermission[] };

/**
 * Permissions for what the app itself adds on top of CPaaS (lead import and
 * routing, follow-up series, services, workspace settings). The
 * server knows nothing of them: the owner sets them per role on the role
 * screen, they are kept in the data store ("Role permissions"), and the app
 * hides what a role lacks. Labels are `appPerm.<key after APP.>`.
 */
export const APP_PERMISSIONS: AppGroup[] = [
  { id: 'leads', keys: [P.app.importLeads, P.app.routing] },
  { id: 'followups', keys: [P.app.series] },
  { id: 'services', keys: [P.app.services, P.app.visits, P.app.reports] },
  { id: 'settings', keys: [P.app.workspaceSettings] },
];

export const isAppPermission = (key: string) => key.toUpperCase().startsWith('APP.');

/** i18n key of an app permission's label: `APP.TEAM_REPORT.VIEW` → `appPerm.TEAM_REPORT_VIEW`. */
export const appPermLabel = (key: string) => `appPerm.${key.slice(4).replace(/\./g, '_')}`;

/** What a role gets until the owner sets its app permissions: day-to-day work, nothing that changes the workspace. */
export const DEFAULT_APP_PERMISSIONS: AppPermission[] = [P.app.visits];
