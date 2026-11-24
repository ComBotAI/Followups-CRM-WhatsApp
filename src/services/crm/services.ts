/**
 * Services and repeat reminders.
 *
 * A business lists what it sells as **services** (Shaving, Car service, Wheel
 * alignment…). Recording a **visit** ("took Shaving today") logs it, updates
 * the contact's "Services taken" / "Last visit" fields, and for each service
 * (re)starts every follow-up series whose start rule is "When this service is
 * recorded": a customer who comes back early or late simply starts over, and
 * the old run's pending reminders are cancelled.
 *
 * Each run is a "Service reminders" record, so restarting works from any
 * phone: API mode cancels its scheduled-message series, WhatsApp-app mode its
 * "WhatsApp to send" tasks.
 *
 * Visits also keep the guest profile on the contact (visit count, total spent,
 * first/last visit, tier) and drive the Visits automations: series that start
 * after every visit, on the Nth visit, or before a yearly date (birthday…).
 */
import { roundCents } from '@/lib/money';
import { toIso } from '@/lib/time';
import { readJson, writeJson } from '@/services/storage';
import { activeAccountId, useAccountsStore } from '@/stores/accounts';
import { tierFor, visitsConfig } from '@/stores/visits';
import { useAuthStore } from '@/stores/auth';
import { whatsAppConfig } from '@/stores/whatsapp';
import { crm, crmFor } from './client';
import { cleanRecord, collectionRef, searchAll } from './datastore';
import { getLead, toLead, updateLead, type Lead } from './leads';
import { CUSTOMER_TYPE, DEFAULT_CONTACT_TYPE, F, ensureLeadSchema, setDropdownOptions } from './schema';
import { dueDates, listSequences, senderContext, startSequence, type Sequence } from './sequences';
import { cancelRunTasks, startManualSequence } from './waTasks';

export type Service = {
  id: string;
  name: string;
  /** Usual price, offered when recording a visit. */
  price: number | null;
  /** Other services this one also counts as (a full service includes wheel balancing). */
  resets: string[];
  /** Usually comes back after this many days: pre-fills the wait of a new reminder. */
  remindDays: number | null;
  active: boolean;
  sort: number;
};

export type ServiceVisit = {
  id: string;
  contactId: string;
  contactName: string;
  serviceIds: string[];
  serviceNames: string[];
  visitedAt: string;
  price: number | null;
  /** Who served the guest: their login id (Reports groups by it). */
  memberId: string;
  memberName: string;
  note: string;
  partySize: number | null;
  /** The guest had been before. */
  returning: boolean;
};

export type RunKind = 'service' | 'visit' | 'milestone' | 'occasion';

export type ServiceRun = {
  id: string;
  contactId: string;
  serviceId: string;
  serviceName: string;
  sequenceId: string;
  sequenceName: string;
  visitAt: string;
  mode: 'api' | 'app';
  seriesId: string;
  due: string[];
  status: 'active' | 'restarted' | 'stopped';
  stopReason: string;
  kind: RunKind;
  contactName: string;
  /** The next message still ahead ('' when none). */
  nextDue: string;
};

const csv = (v: unknown) =>
  String(v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
const numOrNull = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/* ------------------------------- catalogue ------------------------------- */

const CACHE_KEY = 'services.cache.v1';
export const cachedServices = (acct?: string | null): Service[] => readJson<Service[]>(CACHE_KEY, acct === undefined ? activeAccountId() : acct) ?? [];

const serviceFrom = (r: Record<string, unknown>): Service => ({
  id: String(r.id),
  name: String(r.name ?? ''),
  price: numOrNull(r.price),
  resets: csv(r.resets),
  remindDays: numOrNull(r.remind_days),
  active: r.active !== false,
  sort: Number(r.sort ?? 0),
});

export const listServices = async (acct?: string | null): Promise<Service[]> => {
  const id = acct === undefined ? activeAccountId() : acct;
  const { storeId, collectionId } = await collectionRef('services', id);
  // The data store pages at most 100 rows.
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const res = await crmFor(id).dataStoreRecords.list(storeId, collectionId, { rows: 100, page });
    rows.push(...(res.data as Record<string, unknown>[]));
    if (page >= res.pagination.pages) break;
  }
  const list = rows.map(serviceFrom).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  writeJson(CACHE_KEY, list, id);
  return list;
};

/** The contact field's options follow the catalogue (created on first use if missing). */
const syncFieldOptions = async (list: Service[]) => {
  const names = list.filter((s) => s.active).map((s) => s.name);
  await setDropdownOptions(F.services, names).catch(async () => {
    await ensureLeadSchema();
    await setDropdownOptions(F.services, names);
  });
};

// One options update at a time, in order: when several services are saved together (a preset),
// an earlier, shorter list must never land after the full one.
let optionsQueue: Promise<unknown> = Promise.resolve();
const resyncOptions = () => {
  optionsQueue = optionsQueue.then(() => listServices().then(syncFieldOptions)).catch(() => undefined);
};

export const saveService = async (s: Omit<Service, 'id'> & { id?: string }): Promise<string> => {
  const { storeId, collectionId } = await collectionRef('services');
  const api = crm().dataStoreRecords;
  const record = cleanRecord({
    name: s.name.trim(),
    price: s.price ?? undefined,
    resets: s.resets.join(','),
    remind_days: s.remindDays ?? undefined,
    active: s.active,
    sort: s.sort,
  });
  let id = s.id ?? '';
  if (id) await api.update(storeId, collectionId, id, { record });
  else id = (await api.insert(storeId, collectionId, { record })).ids[0] ?? '';
  resyncOptions();
  return id;
};

export const deleteService = async (id: string) => {
  const { storeId, collectionId } = await collectionRef('services');
  await crm().dataStoreRecords.remove(storeId, collectionId, id);
  resyncOptions();
};

/** Ready-made catalogues to start from: services and how often customers usually come back (messages are the user's own). */
export const PRESETS: Record<string, { key: string; name: string; days: number }[]> = {
  salon: [
    { key: 'haircut', name: 'Haircut', days: 30 },
    { key: 'shaving', name: 'Shaving', days: 14 },
    { key: 'hair_colour', name: 'Hair colour', days: 45 },
    { key: 'facial', name: 'Facial', days: 30 },
  ],
  car: [
    { key: 'car_service', name: 'Car service', days: 180 },
    { key: 'wheel_balancing', name: 'Wheel balancing', days: 90 },
    { key: 'wheel_alignment', name: 'Wheel alignment', days: 365 },
    { key: 'car_wash', name: 'Car wash', days: 15 },
  ],
  clinic: [
    { key: 'check_up', name: 'Check-up', days: 180 },
    { key: 'dental_cleaning', name: 'Dental cleaning', days: 180 },
    { key: 'follow_up_visit', name: 'Follow-up visit', days: 7 },
  ],
  gym: [
    { key: 'monthly_plan', name: 'Monthly plan', days: 25 },
    { key: 'quarterly_plan', name: 'Quarterly plan', days: 80 },
    { key: 'personal_training', name: 'Personal training', days: 30 },
  ],
  appliance: [
    { key: 'ac_service', name: 'AC service', days: 180 },
    { key: 'water_purifier_service', name: 'Water purifier service', days: 90 },
    { key: 'filter_change', name: 'Filter change', days: 180 },
  ],
};

/* ------------------------------- runs ------------------------------- */

const runFrom = (r: Record<string, unknown>): ServiceRun => {
  let due: string[] = [];
  try {
    due = JSON.parse(String(r.due_json || '[]')) as string[];
  } catch {
    due = [];
  }
  return {
    id: String(r.id),
    contactId: String(r.contact_id ?? ''),
    serviceId: String(r.service_id ?? ''),
    serviceName: String(r.service_name ?? ''),
    sequenceId: String(r.sequence_id ?? ''),
    sequenceName: String(r.sequence_name ?? ''),
    visitAt: toIso(r.visit_at),
    mode: r.mode === 'app' ? 'app' : 'api',
    seriesId: String(r.series_id ?? ''),
    due,
    status: r.status === 'restarted' || r.status === 'stopped' ? r.status : 'active',
    stopReason: String(r.stop_reason ?? ''),
    kind: r.kind === 'visit' || r.kind === 'milestone' || r.kind === 'occasion' ? r.kind : 'service',
    contactName: String(r.contact_name ?? ''),
    nextDue: toIso(r.next_due),
  };
};

/** The next reminder still ahead of a run, or null when it has none left. */
export const nextDue = (run: ServiceRun, now = Date.now()): string | null => run.due.find((d) => Date.parse(d) > now) ?? null;

export const listRuns = async (contactId: string, acct?: string | null): Promise<ServiceRun[]> => {
  const { storeId, collectionId } = await collectionRef('serviceRuns', acct);
  const res = await crmFor(acct).dataStoreRecords.search(storeId, collectionId, {
    filter: { contact_id: contactId },
    sort: 'visit_at',
    order: 'desc',
    rows: 100,
  });
  return res.data.map((r) => runFrom(r as Record<string, unknown>));
};

/** Cancels what a run still has waiting: its scheduled series (API) and its "WhatsApp to send" tasks. */
const cancelPending = async (run: ServiceRun, acct?: string | null) => {
  if (run.seriesId)
    await crmFor(acct)
      .scheduledMessages.cancelSeries(run.seriesId)
      .catch(() => undefined);
  await cancelRunTasks(run.id, acct).catch(() => undefined);
};

/** Stops a run: cancels what is still pending, marks it stopped (or restarted). */
export const stopRun = async (run: ServiceRun, reason: string, acct?: string | null, status: 'stopped' | 'restarted' = 'stopped') => {
  await cancelPending(run, acct);
  const { storeId, collectionId } = await collectionRef('serviceRuns', acct);
  await crmFor(acct).dataStoreRecords.update(storeId, collectionId, run.id, {
    record: cleanRecord({ status, stop_reason: reason, stopped_at: new Date().toISOString() }),
  });
};

/** What a run hangs off: a service of the catalogue, or a Visits trigger (`visit`, `milestone:5`, `occasion:birthday`). */
type RunSource = Pick<Service, 'id' | 'name'> & { kind?: RunKind };

/**
 * Starts one series as a run for a visit. Each guest has **one run record per
 * series** (and service), reused at every restart: what the old run still had
 * waiting is cancelled and the same record is updated, so the data store grows
 * with guests, not with every visit. `runs` is the contact's runs, any status.
 */
const restartRun = async (seq: Sequence, service: RunSource, lead: Lead, visit: { id: string; at: Date }, runs: ServiceRun[], acct: string | null) => {
  // Newest first (listRuns sorts by visit).
  const same = runs.filter((r) => r.sequenceId === seq.id && r.serviceId === service.id);
  const live = same.filter((r) => r.status === 'active');
  // A back-dated visit (logged late) never replaces reminders started by a later one.
  if (live.some((r) => Date.parse(r.visitAt) > visit.at.getTime())) return;
  for (const old of live) await cancelPending(old, acct);
  const manual = whatsAppConfig(acct).mode !== 'api';
  const { storeId, collectionId } = await collectionRef('serviceRuns', acct);
  const api = crmFor(acct).dataStoreRecords;
  const [keep, ...extra] = same;
  // Duplicates (two devices restarting the same run at once) fold into the one kept.
  for (const x of extra) await api.remove(storeId, collectionId, x.id).catch(() => undefined);
  const due = dueDates(seq, visit.at)
    .filter((d) => d.getTime() > Date.now())
    .map((d) => d.toISOString());
  if (!due.length) {
    if (keep?.status === 'active')
      await api.update(storeId, collectionId, keep.id, { record: cleanRecord({ status: 'stopped', stop_reason: 'nothing ahead' }) }).catch(() => undefined);
    return;
  }
  const record = {
    ...cleanRecord({
      contact_id: lead.id,
      contact_name: lead.name,
      service_id: service.id,
      service_name: service.name,
      sequence_id: seq.id,
      sequence_name: seq.name,
      visit_id: visit.id,
      visit_at: visit.at.toISOString(),
      mode: manual ? 'app' : 'api',
      due_json: JSON.stringify(due),
      status: 'active',
      kind: service.kind ?? 'service',
      next_due: due[0],
    }),
    // A reused record must not keep the last run's series or stop details (null clears a field).
    series_id: null,
    stop_reason: null,
    stopped_at: null,
  };
  let runId = keep?.id ?? '';
  if (runId) await api.update(storeId, collectionId, runId, { record });
  else runId = (await api.insert(storeId, collectionId, { record: cleanRecord(record) })).ids[0] ?? '';
  try {
    if (manual) await startManualSequence(seq, lead, senderContext(acct), { from: visit.at, runId, acct });
    else {
      const series = await startSequence(seq, lead, senderContext(acct), { from: visit.at, title: `${service.name} · ${seq.name}`, acct });
      if (series?.series) await api.update(storeId, collectionId, runId, { record: { series_id: series.series } });
    }
  } catch (e) {
    await api
      .update(storeId, collectionId, runId, { record: cleanRecord({ status: 'stopped', stop_reason: e instanceof Error ? e.message : 'failed' }) })
      .catch(() => undefined);
    throw e;
  }
};

/* ------------------------------- visits ------------------------------- */

/** Every visit of one contact, newest first (paged: a regular can have more than one page). */
export const listVisits = (contactId: string): Promise<ServiceVisit[]> => allVisits(contactId, activeAccountId());

const visitFrom = (r: Record<string, unknown>): ServiceVisit => ({
  id: String(r.id),
  contactId: String(r.contact_id ?? ''),
  contactName: String(r.contact_name ?? ''),
  serviceIds: csv(r.service_ids),
  serviceNames: csv(r.service_names),
  visitedAt: toIso(r.visited_at),
  price: numOrNull(r.price),
  memberId: String(r.member_id ?? ''),
  memberName: String(r.member_name ?? ''),
  note: String(r.note ?? ''),
  partySize: numOrNull(r.party_size),
  returning: r.returning === true || r.returning === 'true',
});

/**
 * Visits from `since` (to before `until`, when given), newest first: the
 * Visits dashboard and Reports. `capped`: more than `maxPages` of 100, the
 * oldest left out.
 */
export const listVisitsBetween = async (since: Date, until?: Date, maxPages = 20): Promise<{ visits: ServiceVisit[]; capped: boolean }> => {
  const { rows, capped } = await searchAll(
    'serviceVisits',
    {
      filter: { visited_at: until ? { $gte: since.toISOString(), $lte: new Date(until.getTime() - 1).toISOString() } : { $gte: since.toISOString() } },
      sort: 'visited_at',
      order: 'desc',
    },
    { maxPages },
  );
  return { visits: rows.map(visitFrom), capped };
};

/** Every visit since a moment, newest first (a busy day has more than one page). */
export const listVisitsSince = async (since: Date): Promise<ServiceVisit[]> => (await listVisitsBetween(since)).visits;

/** Every visit of one contact, newest first (paged). */
const allVisits = async (contactId: string, acct: string | null): Promise<ServiceVisit[]> =>
  (await searchAll('serviceVisits', { filter: { contact_id: contactId }, sort: 'visited_at', order: 'desc' }, { acct })).rows.map(visitFrom);

type VisitStats = { count: number; spent: number; first: Date | null; last: Date | null };

/**
 * A guest's visit count, spend and first/last visit after one visit was added
 * or removed: the visit records, plus whatever the contact had counted beyond
 * its records before the change (history from before records were kept, or an
 * import). `records` is the list after the change.
 */
export const recount = (
  lead: Pick<Lead, 'visitCount' | 'totalSpent' | 'firstVisit' | 'lastVisit'>,
  records: ServiceVisit[],
  change: { added?: ServiceVisit; removed?: ServiceVisit },
): VisitStats => {
  const before = change.added ? records.filter((v) => v.id !== change.added!.id) : change.removed ? [...records, change.removed] : records;
  const sum = (list: ServiceVisit[]) => list.reduce((n, v) => n + (v.price ?? 0), 0);
  const extraCount = Math.max(0, (lead.visitCount || 0) - before.length);
  const extraSpent = Math.max(0, roundCents((lead.totalSpent || 0) - sum(before)));
  const times = records.map((v) => Date.parse(v.visitedAt)).filter((x) => Number.isFinite(x));
  const removedAt = change.removed ? Date.parse(change.removed.visitedAt) : NaN;
  // A first/last visit from the uncounted history stays (unless it was the visit just removed).
  const keep = (d: Date | null) => (d && extraCount > 0 && d.getTime() !== removedAt ? [d.getTime()] : []);
  const firsts = [...times, ...keep(lead.firstVisit)];
  const lasts = [...times, ...keep(lead.lastVisit)];
  return {
    count: records.length + extraCount,
    spent: roundCents(sum(records) + extraSpent),
    first: firsts.length ? new Date(Math.min(...firsts)) : null,
    last: lasts.length ? new Date(Math.max(...lasts)) : null,
  };
};

/**
 * Deletes a visit logged by mistake and puts the guest's profile right (visit
 * count, spend, first/last visit, tier). Reminders it started are left as they
 * are: cancel them from the contact if needed.
 */
export const deleteVisit = async (visit: ServiceVisit, account?: string | null): Promise<{ lead: Lead | null; profileFailed: boolean }> => {
  const acct = account === undefined ? activeAccountId() : account;
  const { storeId, collectionId } = await collectionRef('serviceVisits', acct);
  await crmFor(acct).dataStoreRecords.remove(storeId, collectionId, visit.id);
  const lead = await getLead(visit.contactId, acct).catch(() => null);
  if (!lead) return { lead: null, profileFailed: true };
  const records = (await allVisits(visit.contactId, acct).catch(() => null))?.filter((v) => v.id !== visit.id);
  if (!records) return { lead, profileFailed: true };
  const stats = recount(lead, records, { removed: visit });
  const updated = await updateLead(
    lead,
    { visitCount: stats.count, totalSpent: stats.spent, firstVisit: stats.first, lastVisit: stats.last, tier: tierFor(stats.count, visitsConfig(acct)) },
    acct,
  ).catch(() => null);
  return { lead: updated ?? lead, profileFailed: !updated };
};

/**
 * Active runs with a message going out before `until`, soonest first: who is
 * due back. `next_due` is stored when a run starts and is not moved as each
 * message goes out, so the query takes every run whose stored value is before
 * `until` (past ones included) and works out the real next message from the
 * run's own schedule; a stale `next_due` is put right on the way.
 */
export const listDueRuns = async (until: Date): Promise<ServiceRun[]> => {
  const { storeId, collectionId } = await collectionRef('serviceRuns');
  const api = crm().dataStoreRecords;
  const now = Date.now();
  const runs: ServiceRun[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await api.search(storeId, collectionId, {
      filter: { status: 'active', next_due: { $lte: until.toISOString() } },
      sort: 'next_due',
      order: 'asc',
      page,
      rows: 100,
    });
    runs.push(...res.data.map((r) => runFrom(r as Record<string, unknown>)));
    if (page >= res.pagination.pages) break;
  }
  const out: ServiceRun[] = [];
  for (const run of runs) {
    const next = nextDue(run, now);
    if (next !== run.nextDue) {
      // Move next_due to the real next message, or clear it when everything went out. The run stays
      // active: a finished birthday run is what the yearly sweep re-arms, and a new visit reuses it.
      void api.update(storeId, collectionId, run.id, { record: { next_due: next } }).catch(() => undefined);
    }
    if (next && Date.parse(next) <= until.getTime()) out.push({ ...run, nextDue: next });
  }
  return out.sort((a, b) => a.nextDue.localeCompare(b.nextDue));
};

/* ------------------------------- occasions ------------------------------- */

/** A contact's yearly date for an occasion field (`YYYY-MM-DD`, or '' when unset). */
const occasionDate = (lead: Lead, field: string): string => {
  if (field === 'birthday') return lead.birthday;
  if (field === 'anniversary') return lead.anniversary;
  const v = lead.extra[field];
  return v == null ? '' : String(v).slice(0, 10);
};

/** One year's occurrence of a yearly date: the date itself (10:00 local) and when its series starts (`daysBefore` early). 29 Feb falls on 28 Feb in other years. */
const occurrence = (ymd: string, daysBefore: number, year: number): { start: Date; date: Date } | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const last = new Date(year, month + 1, 0).getDate();
  const date = new Date(year, month, Math.min(day, last), 10, 0, 0, 0);
  const start = new Date(date);
  start.setDate(start.getDate() - daysBefore);
  return { start, date };
};

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/**
 * The next time a yearly date comes round, `daysBefore` early, at 10:00 local
 * time (never in the past). With `late`, a date still ahead (or today) whose
 * start has already passed starts in a minute instead of waiting a whole year
 * (a birthday given at the counter 3 days before it, with a 7-days-early rule).
 */
export const nextOccasionStart = (ymd: string, daysBefore: number, now = new Date(), late = false): Date | null => {
  for (let year = now.getFullYear(); year <= now.getFullYear() + 2; year += 1) {
    const occ = occurrence(ymd, daysBefore, year);
    if (!occ) return null;
    if (occ.start.getTime() > now.getTime()) return occ.start;
    if (late && endOfDay(occ.date).getTime() > now.getTime()) return new Date(now.getTime() + 60_000);
  }
  return null;
};

/** The occurrence under way right now: its start has passed, the date itself hasn't (null when none). */
const currentOccurrence = (ymd: string, daysBefore: number, now: Date): { start: Date; date: Date } | null => {
  for (let year = now.getFullYear() - 1; year <= now.getFullYear() + 1; year += 1) {
    const occ = occurrence(ymd, daysBefore, year);
    if (occ && occ.start.getTime() <= now.getTime() && endOfDay(occ.date).getTime() > now.getTime()) return occ;
  }
  return null;
};

/**
 * Whether a run started for an occurrence of this yearly date (any year): it
 * started within that occurrence's window (from its scheduled start, a day of
 * slack, to the end of the date itself), so a late start counts too.
 */
const runMatchesDate = (run: ServiceRun, ymd: string, daysBefore: number): boolean => {
  const at = new Date(run.visitAt);
  if (Number.isNaN(at.getTime())) return false;
  // The start can fall in the year before the date (2 Jan, 7 days early): check around it.
  return [at.getFullYear() - 1, at.getFullYear(), at.getFullYear() + 1].some((year) => {
    const occ = occurrence(ymd, daysBefore, year);
    return !!occ && at.getTime() >= occ.start.getTime() - 86_400_000 && at.getTime() <= endOfDay(occ.date).getTime() + 86_400_000;
  });
};

/**
 * Keeps one contact's yearly-date series in step with their dates: each
 * occasion series has a run waiting for the next time the date comes round.
 * A date that moved cancels the run waiting for the old one; a date that was
 * cleared cancels its run. Safe to call often (after a visit, after creating
 * or editing the contact, from setup and the daily sweep).
 */
export const armOccasions = async (lead: Lead, sequences?: Sequence[], account?: string | null): Promise<number> => {
  const acct = account === undefined ? activeAccountId() : account;
  const list = (sequences ?? (await listSequences(acct).catch(() => [] as Sequence[]))).filter((x) => x.active && x.trigger.kind === 'occasion');
  if (!list.length) return 0;
  const runs = await listRuns(lead.id, acct).catch(() => [] as ServiceRun[]);
  const { storeId, collectionId } = await collectionRef('serviceRuns', acct);
  const api = crmFor(acct).dataStoreRecords;
  let armed = 0;
  for (const seq of list) {
    if (seq.trigger.kind !== 'occasion') continue;
    const ymd = occasionDate(lead, seq.trigger.field);
    const daysBefore = seq.trigger.daysBefore;
    // A date still ahead whose start passed (given late) starts now, unless this occurrence already had its run.
    const now = new Date();
    let start = nextOccasionStart(ymd, daysBefore, now, true);
    const current = currentOccurrence(ymd, daysBefore, now);
    if (start && current) {
      const handled = runs.some((r) => {
        const at = Date.parse(r.visitAt);
        return (
          r.sequenceId === seq.id && r.stopReason !== 'date changed' && at >= current.start.getTime() - 86_400_000 && at <= endOfDay(current.date).getTime()
        );
      });
      if (handled) start = nextOccasionStart(ymd, daysBefore, now, false);
    }
    const live = runs.filter((r) => r.status === 'active' && r.sequenceId === seq.id && r.due.some((d) => Date.parse(d) > Date.now()));
    // Still on track: a run for this date, waiting or already part-way (its first message sent).
    if (ymd && live.some((r) => runMatchesDate(r, ymd, daysBefore))) continue;
    // Waiting for a date that changed or was cleared: cancel it (restartRun reuses the record).
    for (const old of live) {
      await cancelPending(old, acct);
      await api.update(storeId, collectionId, old.id, { record: { status: 'stopped', stop_reason: 'date changed', next_due: null } }).catch(() => undefined);
      old.status = 'stopped';
    }
    if (!start) continue;
    try {
      await restartRun(seq, { id: `occasion:${seq.trigger.field}`, name: seq.name, kind: 'occasion' }, lead, { id: '', at: start }, runs, acct);
      armed += 1;
    } catch {
      // Tried again on the next sweep.
    }
  }
  return armed;
};

/** True when a contact has a date any occasion series could use. */
const hasDates = (l: Lead) => !!(l.birthday || l.anniversary || Object.values(l.extra).some((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)));

/**
 * Arms the yearly-date series of every contact that already has a date (after
 * Visits setup, or after adding a birthday series). Pages through the contacts;
 * `onProgress` gets (done, total).
 */
export const armAllOccasions = async (onProgress?: (done: number, total: number) => void, account?: string | null): Promise<number> => {
  // Pinned to the account it started for: switching accounts meanwhile doesn't stop or move it.
  const acct = account === undefined ? activeAccountId() : account;
  const sequences = await listSequences(acct).catch(() => [] as Sequence[]);
  if (!sequences.some((x) => x.active && x.trigger.kind === 'occasion')) return 0;
  let armed = 0;
  let done = 0;
  for (let page = 1; page <= 100; page += 1) {
    const res = await crmFor(acct).contacts.list({ page, rows: 100 });
    for (const c of res.data) {
      const lead = toLead(c);
      if (hasDates(lead)) armed += await armOccasions(lead, sequences, acct).catch(() => 0);
      done += 1;
    }
    onProgress?.(done, res.pagination.total);
    if (page >= res.pagination.pages) break;
  }
  return armed;
};

/**
 * Records that a customer took these services: logs the visit, updates the
 * contact's fields and (re)starts each service's reminder series. Returns how
 * many reminder runs started and the names of any that failed.
 */
export const recordVisit = async (
  leadOrId: Lead | string,
  input: {
    serviceIds: string[];
    at?: Date;
    price?: number | null;
    note?: string;
    partySize?: number | null;
    birthday?: string;
    /** The team member who served the guest (default: whoever records it): their revenue in Reports. */
    servedBy?: { id: string; name: string } | null;
  },
  /** The account (default: the active one, fixed now so a switch mid-way can't split the visit across accounts). */
  account?: string | null,
): Promise<{ started: number; failed: string[]; visits: number; lead: Lead; profileFailed: boolean }> => {
  const acct = account === undefined ? activeAccountId() : account;
  // Fresh from the server: visit count and spend are added to, and a copy held on a screen may be behind.
  const lead = await getLead(typeof leadOrId === 'string' ? leadOrId : leadOrId.id, acct).catch((e: unknown) => {
    if (typeof leadOrId === 'string') throw e;
    return leadOrId;
  });
  // The phone's copy, refreshed if it misses one (added on another phone).
  let catalogue = cachedServices(acct);
  if (input.serviceIds.some((id) => !catalogue.some((s) => s.id === id))) catalogue = await listServices(acct);
  const picked = catalogue.filter((s) => input.serviceIds.includes(s.id));
  if (!picked.length) throw new Error('Pick at least one service');
  const at = input.at ?? new Date();
  const profile = useAuthStore.getState().profile;

  const { storeId, collectionId } = await collectionRef('serviceVisits', acct);
  const visitId =
    (
      await crmFor(acct).dataStoreRecords.insert(storeId, collectionId, {
        record: cleanRecord({
          contact_id: lead.id,
          contact_name: lead.name,
          service_ids: picked.map((s) => s.id).join(','),
          service_names: picked.map((s) => s.name).join(', '),
          visited_at: at.toISOString(),
          price: input.price ?? undefined,
          // Id and name always from the same person.
          ...(input.servedBy?.id
            ? { member_id: input.servedBy.id, member_name: input.servedBy.name || 'Member' }
            : { member_id: profile?.id, member_name: [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email }),
          note: input.note?.trim(),
          party_size: input.partySize ?? undefined,
          returning: (lead.visitCount || 0) > 0 || !!lead.lastVisit,
        }),
      })
    ).ids[0] ?? '';

  // A service that "also counts as" others restarts those too.
  const affected = new Map(picked.map((s) => [s.id, s]));
  for (const s of picked) for (const id of s.resets) catalogue.find((x) => x.id === id && affected.set(id, x));

  // The guest profile: visits, spend, first/last visit, tier (and a birthday given at check-in).
  const services = [...new Set([...lead.services, ...[...affected.values()].map((s) => s.name)])];
  // Counted from the visit records (two phones checking the same guest in at once both count), on top of
  // whatever the contact had counted before any records existed (imported history).
  const thisVisit: ServiceVisit = {
    id: visitId,
    contactId: lead.id,
    contactName: lead.name,
    serviceIds: picked.map((s) => s.id),
    serviceNames: picked.map((s) => s.name),
    visitedAt: at.toISOString(),
    price: input.price ?? null,
    memberId: '',
    memberName: '',
    note: '',
    partySize: null,
    returning: false,
  };
  const records = await allVisits(lead.id, acct).catch(() => null);
  const stats = records
    ? recount(lead, records.some((v) => v.id === visitId) ? records : [...records, thisVisit], { added: thisVisit })
    : {
        // The records can't be read: count on from the contact.
        count: (lead.visitCount || 0) + 1,
        spent: roundCents((lead.totalSpent || 0) + (input.price ?? 0)),
        first: !lead.firstVisit || lead.firstVisit.getTime() > at.getTime() ? at : lead.firstVisit,
        last: !lead.lastVisit || lead.lastVisit.getTime() < at.getTime() ? at : lead.lastVisit,
      };
  const visits = stats.count;
  const profileUpdate = {
    services,
    lastVisit: stats.last,
    visitCount: stats.count,
    totalSpent: stats.spent,
    firstVisit: stats.first,
    tier: tierFor(stats.count, visitsConfig(acct)),
    ...(input.birthday ? { birthday: input.birthday } : {}),
    // Someone who came in is a customer now (a lead, or untyped; other types such as Friends & Family stay).
    ...(!lead.contactType || lead.contactType === DEFAULT_CONTACT_TYPE ? { contactType: CUSTOMER_TYPE } : {}),
  };
  // The visit is logged either way; a failed profile update (e.g. a role without contact edit) is reported, not hidden.
  let profileFailed = false;
  const updated: Lead = (await updateLead(lead, profileUpdate, acct).catch(() => {
    profileFailed = true;
    return null;
  })) ?? { ...lead, ...profileUpdate, firstVisit: stats.first, lastVisit: stats.last };

  const sequences = await listSequences(acct).catch(() => [] as Sequence[]);
  const runs = await listRuns(lead.id, acct).catch(() => [] as ServiceRun[]);
  let started = 0;
  const failed: string[] = [];
  const run = async (seq: Sequence, source: RunSource) => {
    try {
      await restartRun(seq, source, updated, { id: visitId, at }, runs, acct);
      started += 1;
    } catch {
      failed.push(`${source.name} · ${seq.name}`);
    }
  };
  for (const service of affected.values()) {
    for (const seq of sequences.filter((x) => x.active && x.trigger.kind === 'service' && x.trigger.serviceId === service.id)) await run(seq, service);
  }
  // Every visit: thank-you, "we miss you" (starts over, so it only goes out if they stay away).
  for (const seq of sequences.filter((x) => x.active && x.trigger.kind === 'visit')) await run(seq, { id: 'visit', name: seq.name, kind: 'visit' });
  // The Nth visit: once.
  for (const seq of sequences.filter((x) => x.active && x.trigger.kind === 'milestone' && x.trigger.visits === visits))
    await run(seq, { id: `milestone:${visits}`, name: seq.name, kind: 'milestone' });
  // A birthday given now (or never armed before) gets its yearly wishes.
  started += await armOccasions(updated, sequences, acct).catch(() => 0);
  return { started, failed, visits, lead: updated, profileFailed };
};

/**
 * Daily, per phone and account: re-arms yearly-date series whose last run is
 * over (next year's birthday). Only looks at occasion runs, then the contacts
 * behind the finished ones. The day is marked done only once it went through,
 * so a start without network tries again next time.
 */
const sweeping = new Map<string, Promise<void>>();

export const sweepOccasions = (account?: string | null): Promise<void> => {
  const acct = account === undefined ? activeAccountId() : account;
  if (!acct) return Promise.resolve();
  const running = sweeping.get(acct);
  if (running) return running;
  const p = sweepNow(acct).finally(() => sweeping.delete(acct));
  sweeping.set(acct, p);
  return p;
};

const sweepNow = async (acct: string): Promise<void> => {
  const key = 'visits.occasionSweep.v1';
  const day = new Date().toDateString();
  if (readJson<string>(key, acct) === day) return;
  // Claimed before the work (the background task shares this storage); given back if it fails.
  writeJson(key, day, acct);
  try {
    await sweepWork(acct);
  } catch (e) {
    writeJson(key, '', acct);
    throw e;
  }
};

const sweepWork = async (acct: string): Promise<void> => {
  const sequences = await listSequences(acct);
  if (!sequences.some((x) => x.active && x.trigger.kind === 'occasion')) return;
  const { storeId, collectionId } = await collectionRef('serviceRuns', acct);
  const runs: ServiceRun[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const res = await crmFor(acct).dataStoreRecords.search(storeId, collectionId, { filter: { status: 'active', kind: 'occasion' }, page, rows: 100 });
    runs.push(...res.data.map((r) => runFrom(r as Record<string, unknown>)));
    if (page >= res.pagination.pages) break;
  }
  const over = runs.filter((r) => r.due.every((d) => Date.parse(d) <= Date.now()));
  for (const contactId of new Set(over.map((r) => r.contactId))) {
    const lead = await getLead(contactId, acct).catch(() => null);
    if (lead) await armOccasions(lead, sequences, acct).catch(() => 0);
  }
};

/** The daily sweep for every signed-in account, one after another. */
export const sweepAllOccasions = async (): Promise<void> => {
  for (const s of useAccountsStore.getState().sessions) await sweepOccasions(s.id).catch(() => undefined);
};
