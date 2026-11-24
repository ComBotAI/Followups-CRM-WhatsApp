/**
 * Visit reports, the fetching: a period's visits (and the stretch before, to
 * compare and to find each guest's visit before), and the reminders that went
 * out — "WhatsApp to send" tasks marked sent (WhatsApp-app mode) and
 * scheduled messages sent (API mode).
 */
import { BROUGHT_BACK_DAYS, comparableRange, DAY, summarize, type Period, type Range, type Report, type SentReminder } from '@/lib/reports';
import { toIso } from '@/lib/time';
import { crm, CrmApiError } from './client';
import { DataStoreUnavailable, gatewayLimit, searchAll } from './datastore';
import { listVisitsBetween } from './services';
import { taskFromRecord } from './waTasks';

/** At most this many pages of 100 per list, so a huge month can't hang the screen. */
const MAX_PAGES = 50;

/** "WhatsApp to send" tasks marked sent in the window (WhatsApp-app mode). */
const sentTasks = async (from: Date, to: Date): Promise<SentReminder[]> => {
  const { rows } = await searchAll(
    'waTasks',
    { filter: { status: 'sent', done_at: { $gte: from.toISOString(), $lte: new Date(to.getTime() - 1).toISOString() } }, sort: 'done_at', order: 'desc' },
    { maxPages: MAX_PAGES },
  );
  return rows
    .map(taskFromRecord)
    .filter((x) => x.doneAt)
    .map((x) => ({ contactId: x.contactId, at: x.doneAt }));
};

/**
 * Scheduled messages sent in the window (API mode). The list comes newest
 * first, but its sort field isn't promised, so it only stops at a page with
 * nothing inside the window and everything before it.
 */
const sentScheduled = async (from: Date, to: Date): Promise<SentReminder[]> => {
  const out: SentReminder[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await gatewayLimit(() => crm().scheduledMessages.list({ status: 'sent', page, rows: 100 }));
    let allOlder = res.data.length > 0;
    for (const m of res.data) {
      const at = toIso(m.completed_at ?? m.scheduled_at);
      if (!at) continue;
      const t = Date.parse(at);
      if (t >= from.getTime()) allOlder = false;
      if (t >= from.getTime() && t < to.getTime()) out.push({ contactId: String(m.contact), at });
    }
    if (allOlder || page >= res.pagination.pages) break;
  }
  return out;
};

/**
 * A reminder source this account doesn't have (no data store table, no API
 * channel, or a role that can't read it) counts as nothing sent. Anything else
 * (offline, rate limited) fails the report, so a 0 is never shown for "couldn't tell".
 */
const unlessMissing = (e: unknown): SentReminder[] => {
  if (e instanceof DataStoreUnavailable || (e instanceof CrmApiError && [403, 404].includes(e.status))) return [];
  throw e;
};

/** One period's report. */
export const loadReport = async (period: Period, range: Range, previous: Range, now = new Date()): Promise<Report> => {
  // Far enough back for the period before and for each guest's visit before a reminder.
  const reach = new Date(Math.min(previous.from.getTime(), range.from.getTime() - BROUGHT_BACK_DAYS * DAY));
  // The period and what came before it are read apart: a cap on a huge month then never eats into the comparison unnoticed.
  const [current, earlier, tasks, scheduled] = await Promise.all([
    listVisitsBetween(range.from, range.to, MAX_PAGES),
    listVisitsBetween(reach, range.from, MAX_PAGES),
    sentTasks(reach, range.to).catch(unlessMissing),
    sentScheduled(reach, range.to).catch(unlessMissing),
  ]);
  const compare = comparableRange(range, previous, now);
  const report = summarize(period, range, compare, [...current.visits, ...earlier.visits], [...tasks, ...scheduled]);
  // The earlier read (newest first) only matters when its cap cut into the comparison stretch.
  const oldestEarlier = earlier.visits.length ? Date.parse(earlier.visits[earlier.visits.length - 1].visitedAt) : -Infinity;
  return { ...report, capped: current.capped || (earlier.capped && oldestEarlier > compare.from.getTime()) };
};
