/**
 * Lead = a CPaaS contact, read through a flat, typed view the UI can render
 * without digging through `custom_field_hash`.
 */
import type { Contact, ContactFilterEntry, ContactTag, CreateContactInput, UpdateContactInput } from '@ab-ecosystem/cpaas';

import { noValueAlts } from '@/lib/filters';
import { normalizePhone } from '@/lib/phone';
import { activeAccountId, useAccountsStore } from '@/stores/accounts';
import { crm, crmFor } from './client';
import { CUSTOMER_TYPE, DEFAULT_CONTACT_TYPE, DEFAULT_STATUS, F, isAppField, type LeadStatus, type Tier } from './schema';

export type Lead = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  /** Digits-only E.164 without `+`, as the platform stores it. '' when the contact has no WhatsApp identity. */
  phone: string;
  avatarUrl: string;
  status: LeadStatus | '';
  /** Leads, Customers, Friends & Family… ('' on contacts added outside the app, shown as Leads). */
  contactType: string;
  /** Services the customer has taken (Settings → Services). */
  services: string[];
  lastVisit: Date | null;
  /** Guest profile (Visits). */
  visitCount: number;
  totalSpent: number;
  firstVisit: Date | null;
  tier: Tier | '';
  /** `YYYY-MM-DD` as entered (a date, not a moment: no time zone). */
  birthday: string;
  anniversary: string;
  /** Where it came from: the contact's system `lead_source` (Manual, Import, WhatsApp…). Read-only. */
  source: string;
  /** The contact's email channel identity, when the platform has one. Read-only. */
  email: string;
  nextFollowUp: Date | null;
  followUpNote: string;
  lastRemark: string;
  agentId: string | null;
  assignedName: string;
  tags: ContactTag[];
  /** Values of fields the user added (`lead_x_*` slugs). */
  extra: Record<string, unknown>;
  unread: number;
  createdAt: Date;
  updatedAt: Date;
  /** The raw contact, for anything the view does not surface. */
  raw: Contact;
};

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const date = (v: unknown): Date | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** A date field as `YYYY-MM-DD` (date fields may come back as a full timestamp). */
export const dayOf = (v: unknown): string => {
  const s = str(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The server's short source codes (`manual`, `import:…`) shown as the dropdown labels. */
const SOURCE_CODES: Record<string, string> = { manual: 'Manual', import: 'Import' };
export const sourceLabel = (raw: string): string => SOURCE_CODES[raw] ?? (raw.startsWith('import:') ? 'Import' : raw);

export const toLead = (c: Contact): Lead => {
  const h = c.custom_field_hash ?? {};
  const first = c.name?.first_name ?? '';
  const last = c.name?.last_name ?? '';
  const wa = c.profile?.whatsapp;
  const phone = wa?.identifier ?? '';
  const name = [first, last].filter(Boolean).join(' ').trim() || wa?.name || (phone ? `+${phone}` : 'Unnamed lead');
  return {
    id: c.id,
    name,
    firstName: first,
    lastName: last,
    phone,
    avatarUrl: wa?.profile_pic ?? '',
    status: str(h[F.status]) as LeadStatus | '',
    contactType: str(h[F.contactType]),
    services: Array.isArray(h[F.services]) ? (h[F.services] as unknown[]).map(String) : str(h[F.services]) ? str(h[F.services]).split(',').map((x) => x.trim()) : [],
    lastVisit: date(h[F.lastVisit]),
    visitCount: num(h[F.visitCount]),
    totalSpent: num(h[F.totalSpent]),
    firstVisit: date(h[F.firstVisit]),
    tier: str(h[F.tier]) as Tier | '',
    birthday: dayOf(h[F.birthday]),
    anniversary: dayOf(h[F.anniversary]),
    source: sourceLabel(c.lead_source?.type || ''),
    email: c.profile?.email?.identifier ?? '',
    nextFollowUp: date(h[F.nextFollowUp]),
    followUpNote: str(h[F.followUpNote]),
    lastRemark: str(h[F.lastRemark]),
    agentId: c.agent ?? null,
    assignedName: str(h[F.assignedName]),
    tags: c.tags ?? [],
    // Every field the account's people use: ones added in this app and ones the CPaaS account already had.
    extra: Object.fromEntries(Object.entries(h).filter(([k]) => !isAppField(k))),
    unread: c.chat_metadata?.unread ?? 0,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
    raw: c,
  };
};

export type LeadInput = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  status?: LeadStatus | '';
  contactType?: string;
  services?: string[];
  lastVisit?: Date | null;
  visitCount?: number;
  totalSpent?: number;
  firstVisit?: Date | null;
  tier?: Tier | '';
  /** `YYYY-MM-DD`, or '' to clear. */
  birthday?: string;
  anniversary?: string;
  /** On create only: sets the contact's system `lead_source` (`Import` → import, anything else → manual). */
  source?: string;
  nextFollowUp?: Date | null;
  followUpNote?: string;
  lastRemark?: string;
  /** Replaces the whole tag set. Prefer `addTags` / `removeTags` for edits: they apply to the tags as stored now. */
  tags?: string[];
  /** Tag ids to add to / remove from the contact's current tags (read from the server, not a cached copy). */
  addTags?: string[];
  removeTags?: string[];
  agentId?: string | null;
  assignedName?: string;
  /** User-defined field values by slug; `''` clears one. */
  extra?: Record<string, unknown>;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : '');

/** Only the custom-field keys present in `input` are written. */
export const toCustomFieldPatch = (input: LeadInput): Record<string, unknown> => {
  const h: Record<string, unknown> = {};
  if (input.status !== undefined) h[F.status] = input.status;
  if (input.contactType !== undefined) h[F.contactType] = input.contactType;
  if (input.services !== undefined) h[F.services] = input.services;
  if (input.lastVisit !== undefined) h[F.lastVisit] = iso(input.lastVisit);
  if (input.visitCount !== undefined) h[F.visitCount] = input.visitCount;
  if (input.totalSpent !== undefined) h[F.totalSpent] = input.totalSpent;
  if (input.firstVisit !== undefined) h[F.firstVisit] = iso(input.firstVisit);
  if (input.tier !== undefined) h[F.tier] = input.tier;
  if (input.birthday !== undefined) h[F.birthday] = input.birthday;
  if (input.anniversary !== undefined) h[F.anniversary] = input.anniversary;
  if (input.nextFollowUp !== undefined) h[F.nextFollowUp] = iso(input.nextFollowUp);
  if (input.followUpNote !== undefined) h[F.followUpNote] = input.followUpNote;
  if (input.lastRemark !== undefined) h[F.lastRemark] = input.lastRemark;
  if (input.assignedName !== undefined) h[F.assignedName] = input.assignedName;
  if (input.extra) for (const [k, v] of Object.entries(input.extra)) if (!isAppField(k)) h[k] = v;
  return h;
};

/** The contact's system `lead_source.type`, a short code, from the Source label. */
const sourceType = (source?: string): string => {
  const s = (source ?? '').toLowerCase();
  if (s.startsWith('import')) return 'import';
  return 'manual';
};

/**
 * The signed-in login of an account, when it is a team member (not the owner). The server
 * assigns a contact a member creates to that member, whatever `agent` is sent.
 */
const memberOf = (accountId?: string | null) => {
  const id = accountId ?? activeAccountId();
  const session = id ? useAccountsStore.getState().sessions.find((x) => x.id === id) : undefined;
  return session && !session.isOwner ? session : null;
};

/** `accountId` pins the call to one account (background sync); default is the active one. */
export const createLead = async (input: LeadInput, accountId?: string | null): Promise<Lead> => {
  // A member's new contact is theirs (the server sets `agent` to them): say so in the name too, so
  // it is not listed as unassigned.
  const member = memberOf(accountId);
  if (member) input = { ...input, agentId: undefined, assignedName: member.name };
  const body: CreateContactInput = {
    name: {
      first_name: input.firstName ?? '',
      last_name: input.lastName ?? '',
    },
    custom_field_hash: {
      [F.status]: 'New',
      [F.contactType]: DEFAULT_CONTACT_TYPE,
      ...toCustomFieldPatch(input),
    },
    lead_source: { type: sourceType(input.source), module: 'followups' },
  };
  const phone = input.phone ? normalizePhone(input.phone) : '';
  if (phone) body.whatsapp = phone;
  const tags = [...new Set([...(input.tags ?? []), ...(input.addTags ?? [])])].filter((id) => !input.removeTags?.includes(id));
  if (tags.length) body.tags = tags;
  if (input.agentId !== undefined) body.agent = input.agentId;
  return toLead(await crmFor(accountId).contacts.create(body));
};

/**
 * Partial update. `custom_field_hash` replaces wholesale on the server, so the
 * current hash is merged with the patch before sending.
 */
/** `accountId` pins the call to one account (background work); default is the active one. */
export const updateLead = async (lead: Lead, input: LeadInput, accountId?: string | null): Promise<Lead> => {
  // Won turns a lead into a customer (unless it is already something else, like Friends & Family).
  if (input.status === 'Won' && input.contactType === undefined && (!lead.contactType || lead.contactType === DEFAULT_CONTACT_TYPE)) {
    input = { ...input, contactType: CUSTOMER_TYPE };
  }
  const patch = toCustomFieldPatch(input);
  const body: UpdateContactInput = {};
  if (input.firstName !== undefined || input.lastName !== undefined) {
    body.name = {
      first_name: input.firstName ?? lead.firstName,
      last_name: input.lastName ?? lead.lastName,
    };
  }
  const tagDelta = !!(input.addTags?.length || input.removeTags?.length);
  if (Object.keys(patch).length || tagDelta) {
    // Merge onto the server's current values, not a cached copy: a list or board row
    // can be older than an edit written since (a visit, a teammate), which would be undone.
    // No fallback to the cached copy: the hash and the tags replace wholesale, and a stale copy would undo newer edits.
    const current = await crmFor(accountId).contacts.get(lead.id);
    if (Object.keys(patch).length) {
      const merged: Record<string, unknown> = { ...(current.custom_field_hash ?? {}), ...patch };
      // An empty value means "clear it". The hash replaces wholesale, so leaving the key out clears it;
      // sending '' was refused for date fields (a done reminder's follow-up date never cleared).
      for (const [k, v] of Object.entries(patch)) if (v === '' || v === null) delete merged[k];
      body.custom_field_hash = merged;
    }
    if (tagDelta && !input.tags) {
      const have = (current.tags ?? []).map((tg) => tg.id);
      const next = [...new Set([...have, ...(input.addTags ?? [])])].filter((id) => !input.removeTags?.includes(id));
      if (next.length !== have.length || next.some((id) => !have.includes(id))) body.tags = next;
    }
  }
  if (input.tags) body.tags = input.tags;
  if (input.agentId !== undefined) body.agent = input.agentId;
  // Nothing actually changes (e.g. tags to add were all there already): no write.
  if (!Object.keys(body).length) return lead;
  return toLead(await crmFor(accountId).contacts.update(lead.id, body));
};

export const getLead = async (id: string, accountId?: string | null): Promise<Lead> => toLead(await crmFor(accountId).contacts.get(id));

/**
 * Moves a lead to the trash (restorable).
 *
 * Written as a status change, not `contacts.delete`: a delete on a contact that is already in the trash
 * (trashed meanwhile by a teammate, or shown from an old copy) deletes it for good.
 */
export const trashLead = async (id: string) => {
  return crm().contacts.update(id, { status: 'trashed' });
};

/** Leads in the trash, newest first. */
export const listTrashed = async (page = 1, search?: string) => {
  const res = await crm().contacts.list({ status: 'trashed', page, rows: 30, search: search?.trim() || undefined });
  return { leads: res.data.map(toLead), page: res.pagination.page, pages: res.pagination.pages, total: res.pagination.total };
};

/** Takes a lead out of the trash. */
export const restoreLead = (id: string) => crm().contacts.update(id, { status: 'live' });

/**
 * Deletes a trashed lead for good, with its notes and WhatsApp identity. Cannot be undone.
 * Only a contact still in the trash: one restored meanwhile is left alone (a delete would only trash it).
 */
export const deleteLeadForever = async (id: string) => {
  const c = await crm().contacts.get(id);
  if (c.status !== 'trashed') throw new Error('This contact is no longer in the trash.');
  return crm().contacts.delete(id);
};

/** Contacts whose name or number matches what was typed (check-in, pickers). */
export const searchLeads = async (query: string, rows = 6): Promise<Lead[]> => {
  const q = query.trim();
  if (!q) return [];
  const res = await crm().contacts.list({ rows, search: q });
  return res.data.map(toLead);
};

/** Looks a lead up by phone through the identifier filter (one request). */
export const findLeadByPhone = async (phone: string, accountId?: string | null): Promise<Lead | null> => {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  const res = await crmFor(accountId).contacts.list({
    rows: 5,
    filter: {
      type: 'followups',
      conditions: [
        {
          operator: null,
          field_id: 'SYSTEM_IDENTIFIER',
          field_type: 'phone',
          condition: 'end with',
          value: digits.slice(-10),
        },
      ],
    },
  });
  // Same full number; or the same last 10 digits when one side was saved without a
  // country code. Never just "any number ending the same" (a foreign number could match).
  const idOf = (c: (typeof res.data)[number]) => (c.profile?.whatsapp?.identifier ?? '').replace(/\D/g, '');
  const match =
    res.data.find((c) => idOf(c) === digits) ??
    res.data.find((c) => {
      const id = idOf(c);
      return (id.length <= 10 || digits.length <= 10) && id.slice(-10) === digits.slice(-10);
    });
  return match ? toLead(match) : null;
};

/**
 * Leads whose dropdown field equals `value` (or has no value when `value` is ''),
 * newest first. Used by the board view, one call per column. `dflt` is the value
 * a contact with none is shown as (Status: New): its column takes those too.
 * "No value" is empty or never written: a cleared value is removed from the contact.
 */
export const listLeadsByField = async (slug: string, value: string, rows = 50, dflt?: string): Promise<{ leads: Lead[]; total: number }> => {
  const eq: ContactFilterEntry = { operator: null, field_id: slug, field_type: 'dropdown', condition: 'equal to', value };
  const none = noValueAlts(slug).map((c, i): ContactFilterEntry => ({ ...c, operator: i === 0 && !value ? null : 'or' }));
  const conditions = !value ? none : value === dflt ? [eq, ...none] : [eq];
  const res = await crm().contacts.list({ rows, filter: { type: 'followups', conditions } });
  return { leads: res.data.map(toLead), total: res.pagination.total };
};

/** The input that sets one dropdown field (built-in or user-defined) on a lead. */
export const dropdownPatch = (slug: string, value: string): LeadInput => {
  switch (slug) {
    case F.status:
      return { status: value as LeadStatus };
    default:
      return { extra: { [slug]: value } };
  }
};

/** A lead's current value for a dropdown field. */
export const dropdownValue = (lead: Lead, slug: string): string => {
  switch (slug) {
    case F.status:
      return lead.status || DEFAULT_STATUS;
    default:
      return lead.extra[slug] == null ? '' : String(lead.extra[slug]);
  }
};

