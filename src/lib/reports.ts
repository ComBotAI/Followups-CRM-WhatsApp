/**
 * Visit reports, the pure part: which dates a period covers (a day, a week
 * from Monday, a calendar month, stepped back with an offset) and what its
 * visits add up to (revenue from new vs returning guests, reminders sent, and
 * the guests who came back after one).
 *
 * The fetching lives in `services/crm/reports.ts`.
 */
import { roundCents } from './money';

export type Period = 'day' | 'week' | 'month';

export type Range = { from: Date; to: Date };

/** A returning visit counts as "brought back" when a reminder went to that guest this many days before it. */
export const BROUGHT_BACK_DAYS = 30;
export const DAY = 86_400_000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The period `offset` steps from the one holding `now` (0 = this one, -1 = the one before). `to` is exclusive. */
export const rangeOf = (period: Period, offset = 0, now = new Date()): Range => {
  const today = startOfDay(now);
  if (period === 'day') {
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return { from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1) };
  }
  if (period === 'week') {
    // Weeks start on Monday.
    const monday = today.getDate() - ((today.getDay() + 6) % 7);
    const from = new Date(today.getFullYear(), today.getMonth(), monday + offset * 7);
    return { from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7) };
  }
  const from = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1) };
};

/** The chart's bars: hours of a day, days of a week or month. Each is [start, end). */
export const bucketsOf = (period: Period, range: Range): Range[] => {
  const out: Range[] = [];
  const step = (d: Date) =>
    period === 'day' ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1) : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  for (let d = range.from; d < range.to; d = step(d)) out.push({ from: d, to: step(d) });
  return out;
};

export type ReportVisit = {
  contactId: string;
  serviceNames: string[];
  visitedAt: string;
  price: number | null;
  /** Who served the guest: grouped by id in Reports (a renamed member stays one row), shown by name. */
  memberId?: string;
  memberName: string;
  returning: boolean;
};

/** One reminder that went out: to whom, when. */
export type SentReminder = { contactId: string; at: string };

export type Bucket = Range & { visits: number; newRevenue: number; returningRevenue: number };
/** `key` is unique per row (a member's id; two people can share a name). */
export type Breakdown = { key: string; name: string; visits: number; revenue: number };

export type Report = {
  /** The period it was worked out for (a screen still showing the last one draws it as that). */
  period: Period;
  revenue: number;
  newRevenue: number;
  returningRevenue: number;
  visits: number;
  newVisits: number;
  returningVisits: number;
  /** Different guests who came. */
  guests: number;
  /** Revenue per visit (0 when none). */
  average: number;
  remindersSent: number;
  /** Visits that came within BROUGHT_BACK_DAYS of a reminder to that guest (sent after their visit before). */
  broughtBack: number;
  broughtBackRevenue: number;
  /** The period before, for the change arrows. */
  previous: { revenue: number; visits: number };
  buckets: Bucket[];
  services: Breakdown[];
  team: Breakdown[];
  /** More visits than one report reads: the oldest were left out (set by the loader). */
  capped?: boolean;
};

const inRange = (t: number, r: Range) => t >= r.from.getTime() && t < r.to.getTime();
const round = roundCents;

/** First index whose value is >= x (sorted ascending). */
const lowerBound = (list: number[], x: number) => {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/** First index whose value is > x (sorted ascending). */
const upperBound = (list: number[], x: number) => {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const addTo = (map: Map<string, Breakdown>, key: string, name: string, revenue: number) => {
  const row = map.get(key) ?? { key, name, visits: 0, revenue: 0 };
  row.visits += 1;
  row.revenue = round(row.revenue + revenue);
  map.set(key, row);
};

const sorted = (map: Map<string, Breakdown>) => [...map.values()].sort((a, b) => b.revenue - a.revenue || b.visits - a.visits || a.name.localeCompare(b.name));

/**
 * What a period adds up to. `visits` may hold more than the period (the one
 * before it too): those set the "previous" numbers and each guest's visit
 * before, which a reminder must come after to count. `sent` should reach back
 * BROUGHT_BACK_DAYS before the period.
 */
export const summarize = (period: Period, range: Range, previous: Range, visits: ReportVisit[], sent: SentReminder[]): Report => {
  const current = visits.filter((v) => inRange(Date.parse(v.visitedAt), range));
  const before = visits.filter((v) => inRange(Date.parse(v.visitedAt), previous));

  // Each guest's visit and reminder times, oldest first (pushed in place: a month can hold thousands).
  const timesBy = (rows: { contactId: string; at: number }[]) => {
    const map = new Map<string, number[]>();
    for (const r of rows) {
      const list = map.get(r.contactId);
      if (list) list.push(r.at);
      else map.set(r.contactId, [r.at]);
    }
    map.forEach((list) => list.sort((a, b) => a - b));
    return map;
  };
  const visitTimes = timesBy(visits.map((v) => ({ contactId: v.contactId, at: Date.parse(v.visitedAt) })));
  const sentTimes = timesBy(sent.map((s) => ({ contactId: s.contactId, at: Date.parse(s.at) })));

  // Only a guest who had been before can be brought back (a first visit after a lead follow-up is a new guest).
  const broughtBackBy = (v: ReportVisit) => {
    if (!v.returning) return false;
    const at = Date.parse(v.visitedAt);
    const times = visitTimes.get(v.contactId) ?? [];
    const i = lowerBound(times, at);
    const since = Math.max(at - BROUGHT_BACK_DAYS * DAY, i > 0 ? times[i - 1] : -Infinity);
    const reminders = sentTimes.get(v.contactId) ?? [];
    const j = lowerBound(reminders, at);
    // The latest reminder before the visit is enough to decide.
    return j > 0 && reminders[j - 1] > since;
  };

  const buckets: Bucket[] = bucketsOf(period, range).map((b) => ({ ...b, visits: 0, newRevenue: 0, returningRevenue: 0 }));
  const starts = buckets.map((b) => b.from.getTime());
  const services = new Map<string, Breakdown>();
  const team = new Map<string, Breakdown>();
  let newRevenue = 0;
  let returningRevenue = 0;
  let newVisits = 0;
  let broughtBack = 0;
  let broughtBackRevenue = 0;

  for (const v of current) {
    const price = v.price ?? 0;
    const at = Date.parse(v.visitedAt);
    const k = upperBound(starts, at) - 1;
    const bucket = k >= 0 && inRange(at, buckets[k]) ? buckets[k] : undefined;
    if (v.returning) returningRevenue += price;
    else {
      newRevenue += price;
      newVisits += 1;
    }
    if (bucket) {
      bucket.visits += 1;
      if (v.returning) bucket.returningRevenue = round(bucket.returningRevenue + price);
      else bucket.newRevenue = round(bucket.newRevenue + price);
    }
    if (broughtBackBy(v)) {
      broughtBack += 1;
      broughtBackRevenue += price;
    }
    // A visit's price is shared evenly by the services in it.
    const names = v.serviceNames.length ? v.serviceNames : [''];
    for (const name of names) if (name) addTo(services, name, name, price / names.length);
    // The newest visit's name wins (visits come newest first), so a rename shows the new name.
    if (v.memberId || v.memberName) addTo(team, v.memberId || v.memberName, v.memberName || '—', price);
  }

  const revenue = round(newRevenue + returningRevenue);
  return {
    period,
    revenue,
    newRevenue: round(newRevenue),
    returningRevenue: round(returningRevenue),
    visits: current.length,
    newVisits,
    returningVisits: current.length - newVisits,
    guests: new Set(current.map((v) => v.contactId).filter(Boolean)).size,
    average: current.length ? round(revenue / current.length) : 0,
    remindersSent: sent.filter((s) => inRange(Date.parse(s.at), range)).length,
    broughtBack,
    broughtBackRevenue: round(broughtBackRevenue),
    previous: { revenue: round(before.reduce((n, v) => n + (v.price ?? 0), 0)), visits: before.length },
    buckets,
    services: sorted(services),
    team: sorted(team),
  };
};

/**
 * The stretch of the period before to compare with. A period still under way
 * (this month, on the 3rd) is compared with the same length of the one before
 * (the 1st–3rd of last month), not all of it.
 */
export const comparableRange = (range: Range, previous: Range, now = new Date()): Range => {
  if (now.getTime() >= range.to.getTime()) return previous;
  const elapsed = Math.max(0, now.getTime() - range.from.getTime());
  return { from: previous.from, to: new Date(Math.min(previous.to.getTime(), previous.from.getTime() + elapsed)) };
};

/** Change from the period before, in whole percent (null when there is nothing to compare with). */
export const change = (now: number, before: number): number | null => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
