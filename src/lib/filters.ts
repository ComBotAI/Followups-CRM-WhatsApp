/**
 * Builds the CPaaS contact-filter DSL from the simple choices the UI offers.
 *
 * The DSL is a flat list where `and` binds tighter than `or`. Every pick below
 * is `and`ed, so a list is "status X AND type Y AND tag Z AND due
 * today". Saved segments are passed through as `segment` and narrowed by this
 * filter — the server intersects the two. A specific agent is not a condition:
 * it goes to the contacts query as `agent`.
 */
import type { ContactFilter, ContactFilterEntry } from '@ab-ecosystem/cpaas';

import { DEFAULT_CONTACT_TYPE, DEFAULT_STATUS, F, type LeadStatus } from '@/services/crm/schema';

export type DueWindow = 'overdue' | 'today' | 'next7' | 'none';

export type LeadFilter = {
  /** Saved segment id or name. */
  segment?: string;
  /** Contact types (Leads, Customers…); "Leads" also covers contacts with no type yet. */
  contactTypes?: string[];
  /** Tag ids; a lead must carry ANY of them. */
  tags?: string[];
  statuses?: LeadStatus[];
  due?: DueWindow;
  /** Agent user id, or `'unassigned'`. */
  agent?: string;
  /** Created within the last N days. */
  createdWithinDays?: number;
  search?: string;
};

const tzOffsetMs = () => new Date().getTimezoneOffset() * 60 * 1000;

/** "Has no value" on a dropdown: empty, or never written (the key is missing; a cleared value is removed). */
export const noValueAlts = (field: string): Omit<ContactFilterEntry, 'operator'>[] => [
  { field_id: field, field_type: 'dropdown', condition: 'is empty' },
  { field_id: field, field_type: 'dropdown', condition: 'does not exist' },
];

/**
 * Builds the condition list. A multi-value pick is an `or` of its values; since
 * the DSL has no parentheses and `and` binds tighter than `or`, the picks are
 * distributed: (status New or Contacted) and tag VIP becomes
 * `New and VIP or Contacted and VIP`. Every condition is kept.
 *
 * Only when the expansion would pass the CPaaS limit of 50 conditions is a
 * field narrowed to its first value; it is named in `collapsed` so the UI can
 * say so.
 */
export const buildContactFilter = (f: LeadFilter): { filter: ContactFilter; collapsed: string[] } => {
  const base: Omit<ContactFilterEntry, 'operator'>[] = [];
  const collapsed: string[] = [];
  const push = (entry: Omit<ContactFilterEntry, 'operator'>) => base.push(entry);

  if (f.tags?.length)
    push({
      field_id: 'tags',
      field_type: 'string',
      condition: 'equal to',
      value: f.tags,
    });

  // "No value" means the field is empty OR was never written (the key is missing);
  // date fields don't accept "is empty" at all. These become alternatives below.
  const noValue: { field: string; alts: Omit<ContactFilterEntry, 'operator'>[] }[] = [];
  if (f.agent === 'unassigned')
    noValue.push({
      field: F.assignedName,
      alts: [
        { field_id: F.assignedName, field_type: 'text', condition: 'is empty' },
        { field_id: F.assignedName, field_type: 'text', condition: 'does not exist' },
      ],
    });

  if (f.createdWithinDays) {
    push({
      field_id: 'SYSTEM_CREATED_ON',
      field_type: 'date',
      condition: 'within',
      direction: 'LAST',
      timeUnit: 'days',
      value: f.createdWithinDays,
      offset: tzOffsetMs(),
    });
  }

  if (f.due && f.due !== 'none') {
    if (f.due === 'today') {
      push({
        field_id: F.nextFollowUp,
        field_type: 'timestamp',
        condition: 'within',
        direction: 'TODAY',
        offset: tzOffsetMs(),
      });
    } else if (f.due === 'overdue') {
      // Due before today, by the phone's midnight: a relative window is anchored there through `offset`
      // (documented), while a bare date for `before` may be read as UTC midnight. Ten years back is "any".
      push({
        field_id: F.nextFollowUp,
        field_type: 'timestamp',
        condition: 'within',
        direction: 'LAST',
        timeUnit: 'days',
        value: 3650,
        offset: tzOffsetMs(),
      });
    } else {
      push({
        field_id: F.nextFollowUp,
        field_type: 'timestamp',
        condition: 'within',
        direction: 'NEXT',
        timeUnit: 'days',
        value: 7,
        offset: tzOffsetMs(),
      });
    }
  }

  const dropdown = (field: string, value: string): Omit<ContactFilterEntry, 'operator'> => ({
    field_id: field,
    field_type: 'dropdown',
    condition: 'equal to',
    value,
  });
  // Each multi pick is a list of alternatives (any of them), distributed below.
  const multi: { field: string; alts: Omit<ContactFilterEntry, 'operator'>[] }[] = [...noValue];
  /**
   * A dropdown pick: any of `values`. The default value (`dflt`) also takes contacts with no value
   * at all, which the app shows as that default (added outside the app, e.g. from the inbox or the
   * CPaaS panel, or the value was cleared).
   */
  const pick = (field: string, values: string[] | undefined, dflt: string) => {
    if (!values?.length) return;
    const alts = values.flatMap((v) => (v === dflt ? [dropdown(field, v), ...noValueAlts(field)] : [dropdown(field, v)]));
    if (alts.length === 1) push(alts[0]);
    else multi.push({ field, alts });
  };
  pick(F.contactType, f.contactTypes, DEFAULT_CONTACT_TYPE);
  pick(F.status, f.statuses, DEFAULT_STATUS);

  // Every run holds the single picks plus one condition per multi pick, so the total is
  // (number of runs) × (conditions per run). Fields with the fewest values are expanded
  // first; any field that would pass the limit is narrowed to its first value instead.
  // (Deciding up front keeps the total within the limit however the picks are ordered.)
  const perRun = base.length + multi.length;
  const expand = new Set<number>();
  let count = 1;
  for (const i of multi.map((_, i) => i).sort((a, b) => multi[a].alts.length - multi[b].alts.length)) {
    if (count * multi[i].alts.length * perRun <= MAX_CONDITIONS) {
      count *= multi[i].alts.length;
      expand.add(i);
    }
  }
  let runs: Omit<ContactFilterEntry, 'operator'>[][] = [base];
  multi.forEach((m, i) => {
    if (expand.has(i)) runs = runs.flatMap((r) => m.alts.map((a) => [...r, a]));
    else {
      runs = runs.map((r) => [...r, m.alts[0]]);
      if (m.alts.length > 1) collapsed.push(m.field);
    }
  });

  const conditions = runs[0].length ? fromRuns(runs as Entry[][]) : [];
  return { filter: { type: 'followups', conditions }, collapsed };
};

export const countActiveFilters = (f: LeadFilter): number =>
  [
    f.segment,
    f.contactTypes?.length,
    f.tags?.length,
    f.statuses?.length,
    f.due && f.due !== 'none',
    f.agent,
    f.createdWithinDays,
  ].filter(Boolean).length;

/* ---------------------- combining filters (no nesting) --------------------- */

type Entry = ContactFilterEntry;

/** Splits a flat condition list into its `or`-separated runs of `and`ed conditions. */
export const toRuns = (conds: Entry[] = []): Entry[][] => {
  const runs: Entry[][] = [];
  for (const c of conds) {
    if (!runs.length || c.operator === 'or') runs.push([]);
    runs[runs.length - 1].push(c);
  }
  return runs;
};

/** Joins runs back into a flat list: `and` inside a run, `or` between runs. */
export const fromRuns = (runs: Entry[][]): Entry[] =>
  runs.flatMap((run, r) => run.map((c, i) => ({ ...c, operator: i === 0 ? (r === 0 ? null : 'or') : 'and' })));

/**
 * `a AND b` for flat filters where `and` binds tighter than `or`. Distributes
 * the runs, (a1 or a2) and (b1 or b2) = a1b1 or a1b2 or a2b1 or a2b2, which
 * is the only way to express it without parentheses. An empty side matches
 * everyone, so the other side is returned as is.
 */
export const andFilters = (a: ContactFilter | undefined, b: ContactFilter | undefined): ContactFilter => {
  const ra = toRuns(a?.conditions);
  const rb = toRuns(b?.conditions);
  if (!ra.length) return { type: 'followups', conditions: fromRuns(rb) };
  if (!rb.length) return { type: 'followups', conditions: fromRuns(ra) };
  return { type: 'followups', conditions: fromRuns(ra.flatMap((x) => rb.map((y) => [...x, ...y]))) };
};

/** The CPaaS limit on conditions in one filter. */
export const MAX_CONDITIONS = 50;

/**
 * Whether a lead matches a filter, checked on the phone (for WhatsApp tasks,
 * which CPaaS doesn't re-check). Segments can't be evaluated here and count as
 * a match; everything else the filter offers is checked.
 */
export const leadMatches = (
  lead: {
    status: string;
    tags: { id: string }[];
    contactType?: string;
    agentId: string | null;
    nextFollowUp: Date | null;
    createdAt: Date;
  },
  f: LeadFilter | undefined,
  now = new Date(),
): boolean => {
  if (!f) return true;
  if (f.statuses?.length && !f.statuses.includes((lead.status || DEFAULT_STATUS) as LeadStatus)) return false;
  if (f.contactTypes?.length && !f.contactTypes.includes(lead.contactType || DEFAULT_CONTACT_TYPE)) return false;
  if (f.tags?.length && !lead.tags.some((tag) => f.tags!.includes(tag.id))) return false;
  if (f.agent === 'unassigned' ? !!lead.agentId : f.agent && lead.agentId !== f.agent) return false;
  if (f.createdWithinDays && now.getTime() - lead.createdAt.getTime() > f.createdWithinDays * 86400_000) return false;
  if (f.due && f.due !== 'none') {
    const at = lead.nextFollowUp?.getTime();
    if (at == null) return false;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + 86400_000;
    if (f.due === 'today' && (at < start.getTime() || at >= end)) return false;
    if (f.due === 'overdue' && at >= start.getTime()) return false;
    if (f.due === 'next7' && (at < now.getTime() || at > now.getTime() + 7 * 86400_000)) return false;
  }
  return true;
};
