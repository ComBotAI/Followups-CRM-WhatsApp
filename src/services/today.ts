/**
 * The "Today" follow-up queue: one ranked list of who to reach next, so nobody
 * has to decide. Sources, highest priority first:
 *   1. follow-ups overdue (older first)
 *   2. follow-up reminders due now
 *   3. follow-ups due later today
 * One entry per number, carrying every reason it is there. Items skipped
 * today drop off.
 */
import { buildContactFilter } from '@/lib/filters';
import { phoneKey } from '@/lib/phone';
import { dayjs } from '@/lib/time';
import { readJson, writeJson } from '@/services/storage';
import { crm } from './crm/client';
import { toLead, type Lead } from './crm/leads';
import { isCallReminder, localReminders } from './crm/records';

export type TodayReason = 'overdue' | 'reminder' | 'dueToday';

export type TodayItem = {
  key: string;
  leadId: string;
  name: string;
  phone: string;
  status: string;
  reasons: TodayReason[];
  /** The moment behind the top reason (missed at, due at, created at). */
  at: number;
  score: number;
};

// The phone's local date: a UTC key would roll over at 05:30 in India.
const dayKey = () => `today.skipped.${dayjs().format('YYYY-MM-DD')}`;
export const skippedToday = () => new Set(readJson<string[]>(dayKey()) ?? []);
export const skipToday = (key: string) => writeJson(dayKey(), [...skippedToday(), key]);

/** The queue without one entry (skipped, or followed up), for updating the screen without rebuilding it. */
export const withoutItem = (items: TodayItem[] | undefined, key: string) => items?.filter((it) => it.key !== key);

const list = async (filter: Parameters<typeof buildContactFilter>[0], rows = 100): Promise<Lead[]> => {
  const { filter: f } = buildContactFilter(filter);
  const res = await crm().contacts.list({ rows, filter: f.conditions?.length ? f : undefined });
  return res.data.map(toLead);
};

export const buildTodayQueue = async (): Promise<TodayItem[]> => {
  const now = Date.now();
  // Tonight by the clock, not start + 24 h: DST days are 23 or 25 hours long.
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const items = new Map<string, TodayItem>();
  const add = (base: Omit<TodayItem, 'reasons' | 'score' | 'key'>, reason: TodayReason, score: number) => {
    const key = phoneKey(base.phone) || base.leadId;
    if (!key) return;
    const cur = items.get(key);
    if (!cur) {
      items.set(key, { ...base, key, reasons: [reason], score });
      return;
    }
    if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
    if (!cur.leadId && base.leadId) Object.assign(cur, { leadId: base.leadId, name: base.name || cur.name, status: base.status });
    if (score > cur.score) Object.assign(cur, { score, at: base.at, reasons: [reason, ...cur.reasons.filter((r) => r !== reason)] });
  };
  const fromLead = (l: Lead, at: number) => ({ leadId: l.id, name: l.name, phone: l.phone, status: l.status, at });

  const [overdue, dueToday] = await Promise.all([list({ due: 'overdue' }).catch(() => []), list({ due: 'today' }).catch(() => [])]);
  // 1. Overdue follow-ups: the older, the more urgent.
  for (const l of overdue) {
    const at = l.nextFollowUp?.getTime() ?? now;
    add(fromLead(l, at), 'overdue', 800 + Math.min(150, (now - at) / 3600_000));
  }
  // 2. Follow-up reminders due by now (tasks and WhatsApp reminders are listed on their own).
  for (const r of localReminders().filter((x) => !x.done && isCallReminder(x) && Date.parse(x.due_at) <= endOfDay.getTime())) {
    const at = Date.parse(r.due_at);
    add(
      { leadId: r.contact_id, name: r.contact_name, phone: r.phone, status: '', at },
      at <= now ? 'reminder' : 'dueToday',
      at <= now ? 750 : 600,
    );
  }
  // 3. Due later today.
  for (const l of dueToday) add(fromLead(l, l.nextFollowUp?.getTime() ?? now), 'dueToday', 600);

  // Drop what was skipped today.
  const skipped = skippedToday();
  return (
    [...items.values()]
      .filter((it) => !skipped.has(it.key) && it.phone)
      // Already overdue (or a reminder already past): "due today" would only contradict it.
      .map((it) => (it.reasons.includes('overdue') || it.reasons.includes('reminder') ? { ...it, reasons: it.reasons.filter((r) => r !== 'dueToday') } : it))
      // Same urgency: the earlier one first (9:00 before 18:00).
      .sort((a, b) => b.score - a.score || a.at - b.at)
  );
};
