/**
 * The lead schema this app provisions on the CPaaS account.
 *
 * Leads *are* CPaaS contacts. Everything the app needs to know about a lead
 * that the contact object has no native slot for lives in custom fields, keyed
 * by slug in `contact.custom_field_hash`. Slugs are immutable, so they are
 * prefixed and chosen once here; labels and options can change later.
 *
 * Native contact fields we use directly (never duplicated as custom fields):
 *   - `name`, `profile.whatsapp.identifier` (phone), `profile.email` (read-only:
 *     the platform owns channel identities), `tags`, `agent` (assignee), `team`,
 *   `lead_source` (where it came from), `status` (live/trashed), `chat_metadata`.
 *
 * The app is about follow-ups, so it keeps only the fields follow-ups,
 * reminders and visits run on. Anything else a business wants (company, city…)
 * it adds itself in Settings → Fields.
 *
 * Reserved slugs (`email`, `status`, `tags`, `name`, ...) are avoided by prefixing.
 */
import type { CreateCustomFieldInput, CustomField, CustomFieldType } from '@ab-ecosystem/cpaas';


import { crm, crmFor, CrmApiError, CrmConfigError, describeCrmError, isPlanError } from './client';

/** What a contact is to you. Every new contact starts as "Leads"; Won moves it to "Customers". Users can add more. */
export const CONTACT_TYPES = ['Leads', 'Customers', 'Friends & Family'] as const;
export const DEFAULT_CONTACT_TYPE = 'Leads';
export const CUSTOMER_TYPE = 'Customers';

export const LEAD_STATUSES = ['New', 'Contacted', 'Follow-Up', 'Interested', 'Not Interested', 'No Response', 'Won', 'Lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
/** What a contact with no status yet is shown and filtered as. */
export const DEFAULT_STATUS: LeadStatus = 'New';

/** Guest tiers, by number of visits (thresholds in the Visits settings). */
export const TIERS = ['New', 'Regular', 'VIP'] as const;
export type Tier = (typeof TIERS)[number];

/** Slug prefix for fields the user adds from Settings → Fields. */
export const USER_FIELD_PREFIX = 'lead_x_';
export const isUserField = (slug: string) => slug.startsWith(USER_FIELD_PREFIX);

/**
 * A dropdown the account's people work with: one added in this app, or one the
 * CPaaS account already had. Not the app's own lead fields (status, source…,
 * shown separately) or system fields.
 */
export const isAccountDropdown = (f: Pick<CustomField, 'slug' | 'type' | 'dataType'>) =>
  f.dataType === 'dropdown' && (isUserField(f.slug) || (f.type === 'user' && !isAppField(f.slug)));

/** Field types a user can add. */
export const USER_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'amount',
  'date',
  'email',
  'phone',
  'url',
  'dropdown',
] as const satisfies readonly CustomFieldType[];
export type UserFieldType = (typeof USER_FIELD_TYPES)[number];

/** Slugs, in one place. Everything else references these constants. */
export const F = {
  status: 'lead_status',
  nextFollowUp: 'lead_next_follow_up',
  followUpNote: 'lead_follow_up_note',
  lastRemark: 'lead_last_remark',
  assignedName: 'lead_assigned_name',
  contactType: 'lead_contact_type',
  services: 'lead_services',
  lastVisit: 'lead_last_visit',
  // Guest profile (Visits): kept up to date by every recorded visit.
  visitCount: 'lead_visit_count',
  totalSpent: 'lead_total_spent',
  firstVisit: 'lead_first_visit',
  tier: 'lead_tier',
  birthday: 'lead_birthday',
  anniversary: 'lead_anniversary',
} as const;

export type LeadFieldSlug = (typeof F)[keyof typeof F];

const APP_SLUGS: ReadonlySet<string> = new Set(Object.values(F));
/**
 * A field the app itself runs on (`lead_status`, `lead_next_follow_up`…): set through the lead's own
 * properties only. Exactly the slugs in `F`: an account's own fields that happen to start with
 * `lead_` (e.g. `lead_score`) are the account's, shown and edited like any other.
 */
export const isAppField = (slug: string) => APP_SLUGS.has(slug);

type FieldSpec = Omit<CreateCustomFieldInput, 'slug'> & {
  slug: LeadFieldSlug;
  dataType: CustomFieldType;
};

const dropdown = (slug: LeadFieldSlug, name: string, options: readonly string[], extra: Partial<FieldSpec> = {}): FieldSpec => ({
  slug,
  name,
  dataType: 'dropdown',
  props: { options: options.map((value) => ({ label: value, value })) },
  showInSidebar: true,
  showAsLabel: true,
  ...extra,
});

/**
 * Ordered so the most important fields are created first; a plan quota that
 * runs out part-way still leaves a usable schema.
 */
export const LEAD_FIELDS: FieldSpec[] = [
  dropdown(F.status, 'Lead status', LEAD_STATUSES, {
    caption: 'Where this lead is in your pipeline',
    default: { value: 'New' },
  }),
  dropdown(F.contactType, 'Contact type', CONTACT_TYPES, {
    caption: 'Leads, customers, friends & family… Add your own options in Settings → Fields',
    default: { value: DEFAULT_CONTACT_TYPE },
  }),
  {
    slug: F.nextFollowUp,
    name: 'Next follow-up',
    dataType: 'timestamp',
    caption: 'When to follow up next',
    showInSidebar: true,
  },
  {
    slug: F.lastRemark,
    name: 'Last remark',
    dataType: 'textarea',
    showInSidebar: true,
  },
  { slug: F.followUpNote, name: 'Follow-up note', dataType: 'text' },
  {
    slug: F.assignedName,
    name: 'Assigned to',
    dataType: 'text',
    caption: 'Display name of the assignee (the id is on the contact)',
  },
  {
    slug: F.services,
    name: 'Services taken',
    dataType: 'multi_select',
    caption: 'Kept in step with Settings → Services',
    props: { options: [] },
    showInSidebar: true,
    showAsLabel: true,
  },
  { slug: F.lastVisit, name: 'Last visit', dataType: 'timestamp', showInSidebar: true },
  { slug: F.visitCount, name: 'Visits', dataType: 'number', default: { value: 0 }, showInSidebar: true },
  { slug: F.totalSpent, name: 'Total spent', dataType: 'amount', showInSidebar: true },
  { slug: F.firstVisit, name: 'First visit', dataType: 'timestamp' },
  dropdown(F.tier, 'Guest tier', TIERS, { caption: 'New, Regular or VIP, from the number of visits' }),
  { slug: F.birthday, name: 'Birthday', dataType: 'date', caption: 'For birthday wishes and offers', showInSidebar: true },
  { slug: F.anniversary, name: 'Anniversary', dataType: 'date', caption: 'For anniversary wishes and offers' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Worth another try: a network drop, a rate limit, a server hiccup, or a quota
 * refusal (402). CPaaS has been seen refusing creates one after another on a
 * plan with plenty of room (its counter lags right after a create) and then
 * accepting them a moment later, so a 402 is retried before it is believed.
 */
const isRetryable = (err: unknown) => {
  if (err instanceof CrmConfigError) return false;
  if (!(err instanceof CrmApiError)) return true;
  return err.status === 402 || err.status === 429 || err.status >= 500;
};

/** A quota refusal whose own numbers say the plan really is full. */
const reallyFull = (err: unknown) => {
  const d = (err instanceof CrmApiError ? err.details : undefined) as { limit?: number; used?: number } | undefined;
  return typeof d?.limit === 'number' && typeof d?.used === 'number' && d.used >= d.limit;
};

const RETRY_DELAYS = [800, 2000, 4000];

/** One create, retried through transient refusals. */
const createWithRetry = async (api: ReturnType<typeof crmFor>, spec: FieldSpec): Promise<CustomField> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await api.customFields.create(spec);
    } catch (err) {
      if (attempt >= RETRY_DELAYS.length || !isRetryable(err) || reallyFull(err)) throw err;
      const after = err instanceof CrmApiError ? (err.details as { retryAfterMs?: number } | undefined)?.retryAfterMs : undefined;
      await sleep(Math.min(Math.max(after ?? 0, RETRY_DELAYS[attempt]), 10_000));
    }
  }
};

export type SchemaReport = {
  existing: string[];
  created: string[];
  failed: { slug: string; reason: string }[];
  planLimited: boolean;
};

/**
 * Idempotent: lists what the account already has and creates only the missing
 * fields. Safe to run on every sign-in. A 402 stops further creates (the plan
 * is out of custom fields) without failing the whole bootstrap.
 */
export const ensureLeadSchema = async (
  accountId?: string | null,
): Promise<{
  fields: CustomField[];
  report: SchemaReport;
}> => {
  const report: SchemaReport = {
    existing: [],
    created: [],
    failed: [],
    planLimited: false,
  };
  const api = crmFor(accountId);
  const existing = await listAllCustomFields(accountId);
  const bySlug = new Map(existing.map((f) => [f.slug, f]));
  const fields = [...existing];
  let conflicted = false;

  for (const spec of LEAD_FIELDS) {
    if (bySlug.has(spec.slug)) {
      report.existing.push(spec.slug);
      continue;
    }
    if (report.planLimited) {
      report.failed.push({ slug: spec.slug, reason: 'plan limit' });
      continue;
    }
    try {
      const created = await createWithRetry(api, spec);
      fields.push(created);
      report.created.push(spec.slug);
    } catch (err) {
      // Already there: an earlier attempt went through even though its answer was lost.
      if (err instanceof CrmApiError && err.status === 409) {
        conflicted = true;
        report.existing.push(spec.slug);
        continue;
      }
      if (isPlanError(err)) report.planLimited = true;
      report.failed.push({ slug: spec.slug, reason: describeCrmError(err) });
    }
  }
  if (conflicted) return { fields: await listAllCustomFields(accountId), report };
  return { fields, report };
};

export const listAllCustomFields = async (accountId?: string | null): Promise<CustomField[]> => {
  const out: CustomField[] = [];
  let page = 1;
  for (;;) {
    const res = await crmFor(accountId).customFields.list({ page, rows: 100 });
    out.push(...res.data);
    if (page >= res.pagination.pages) break;
    page += 1;
  }
  return out;
};

/** Dropdown options as plain strings, however the field stored them. */
export const dropdownOptions = (field: CustomField | undefined, fallback: readonly string[] = []): string[] => {
  // Fields made elsewhere may keep their choices under another name, or give only labels.
  const props = field?.props as { options?: unknown; values?: unknown; choices?: unknown } | undefined;
  const raw = [props?.options, props?.values, props?.choices].find(Array.isArray);
  if (!raw) return [...fallback];
  const values = raw
    .map((o) => {
      if (typeof o === 'string' || typeof o === 'number') return String(o);
      const x = (o ?? {}) as { value?: unknown; label?: unknown; name?: unknown };
      const v = x.value ?? x.label ?? x.name;
      return v == null ? '' : String(v);
    })
    .filter(Boolean);
  return values.length ? values : [...fallback];
};

export const setDropdownOptions = (slug: string, options: string[], accountId?: string | null) =>
  crmFor(accountId).customFields.update(slug, {
    props: { options: options.map((value) => ({ label: value, value })) },
  });

/** Turns a label into a free `lead_x_*` slug. */
export const userFieldSlug = (name: string, taken: Iterable<string>): string => {
  const cleaned = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const base = USER_FIELD_PREFIX + (cleaned || 'field');
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i += 1) if (!used.has(`${base}_${i}`)) return `${base}_${i}`;
};

/** Creates a field the user defined (Settings → Fields). */
export const createUserField = (input: { name: string; type: UserFieldType; options?: string[]; taken: Iterable<string> }) =>
  crm().customFields.create({
    slug: userFieldSlug(input.name, input.taken),
    name: input.name.trim(),
    dataType: input.type,
    showInSidebar: true,
    ...(input.type === 'dropdown' ? { props: { options: (input.options ?? []).map((value) => ({ label: value, value })) } } : {}),
  });

export const renameField = (slug: string, name: string) => crm().customFields.update(slug, { name: name.trim() });

export const deleteUserField = (slug: string) => {
  if (!isUserField(slug)) throw new Error('Only fields you added can be deleted');
  return crm().customFields.delete(slug);
};
