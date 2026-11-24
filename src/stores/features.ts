/**
 * The parts of the app: the CRM (contacts/leads, board, reminders), auto
 * follow-ups, services and cloud settings sync. Every
 * account has all of them; there is no switch. The `features.x` checks around
 * the app stay as the place to hide a part again if that is ever needed.
 */
export type Feature = 'crm' | 'followups' | 'services' | 'cloudSync';
export type Features = Record<Feature, boolean>;

const ALL: Features = { crm: true, followups: true, services: true, cloudSync: true };

/** An account's features: always all of them. */
export const featuresOf = (_accountId?: string | null): Features => ALL;

export const useFeatures = (_accountId?: string | null): Features => ALL;

export type HomeTab = 'visits' | 'contacts' | 'more';

/** What the signed-in person's role lets them open (owners: everything). */
export type HomePerms = { contacts: boolean };
const ALL_PERMS: HomePerms = { contacts: true };

/**
 * The first section an account opens on: Visits (the front desk), else
 * contacts, else More. A section the role can't open is skipped (Visits and
 * contacts need the contact list), so a member never lands on a "not allowed"
 * page as their home.
 */
export const homeTabFor = (f: Features, _apiMode: boolean, can: HomePerms = ALL_PERMS): HomeTab =>
  f.services && f.crm && can.contacts ? 'visits' : f.crm && can.contacts ? 'contacts' : 'more';
