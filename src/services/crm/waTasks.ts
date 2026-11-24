/**
 * Follow-up series with the WhatsApp app (phone mode).
 *
 * There is no API to send through, so starting a series on a lead writes one
 * task per step into the "WhatsApp to send" data-store collection: who, when,
 * and the message with its fields already filled in. The lead's owner sees
 * today's (and missed) tasks in the app, taps WhatsApp to open the chat with
 * the text ready, sends it, and the task is marked sent. A phone notification
 * fires at each due time.
 *
 * The same series definitions serve API mode: switching later needs nothing
 * re-created, only a channel.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { leadMatches, type LeadFilter } from '@/lib/filters';
import { REMINDER_CHANNEL } from '@/services/notifications';
import { readJson, writeJson } from '@/services/storage';
import { activeAccountId, useAccountsStore } from '@/stores/accounts';
import { myUserId } from '@/stores/auth';
import { crm, crmFor, CrmApiError } from './client';
import { cleanRecord, collectionRef } from './datastore';
import { getLead, type Lead } from './leads';
import { cumulativeMinutes, expandedSteps, type Sequence, type SequenceStep } from './sequences';
import { cachedTemplates, fill, fillTokens, parseTemplate, resolveValues, slotsOf } from './whatsapp';
import { env } from '@/config/env';
import { featuresOf } from '@/stores/features';
import { toIso } from '@/lib/time';

export type WaTaskStatus = 'pending' | 'sent' | 'skipped' | 'cancelled';

export type WaTask = {
  id: string;
  contactId: string;
  contactName: string;
  phone: string;
  sequenceId: string;
  sequenceName: string;
  stepIndex: number;
  text: string;
  dueAt: string;
  memberId: string;
  status: WaTaskStatus;
  doneAt: string;
  /** keep-sending condition + this step's own condition, as lead filters. */
  conditions: LeadFilter[];
  onFail: 'skip' | 'cancel_series';
  /** Set on service reminders: the run a new visit restarts. */
  runId: string;
};

type Ctx = { myName: string; workspace: string };

/** A "WhatsApp to send" record as a task (also read by Reports). */
export const taskFromRecord = (r: Record<string, unknown>): WaTask => {
  let conditions: LeadFilter[] = [];
  try {
    conditions = JSON.parse(String(r.conditions_json || '[]')) as LeadFilter[];
  } catch {
    conditions = [];
  }
  return {
    id: String(r.id),
    contactId: String(r.contact_id ?? ''),
    contactName: String(r.contact_name ?? ''),
    phone: String(r.phone ?? ''),
    sequenceId: String(r.sequence_id ?? ''),
    sequenceName: String(r.sequence_name ?? ''),
    stepIndex: Number(r.step_index ?? 0),
    text: String(r.text ?? ''),
    dueAt: toIso(r.due_at),
    memberId: String(r.member_id ?? ''),
    status: (String(r.status || 'pending') as WaTaskStatus) ?? 'pending',
    doneAt: toIso(r.done_at),
    conditions,
    onFail: r.on_fail === 'cancel_series' ? 'cancel_series' : 'skip',
    runId: String(r.run_id ?? ''),
  };
};

/**
 * A step's message as plain text for the WhatsApp app: a text step's words
 * (media as a link under them), or an approved template's header and body
 * with its variables filled in from the lead.
 */
export const stepText = (seq: Sequence, step: SequenceStep, lead: Lead, ctx: Ctx): string => {
  if (step.kind === 'session' && step.session) {
    const text = fillTokens(step.session.text, lead, ctx).trim();
    const link = step.session.media?.link;
    return [text, link].filter(Boolean).join('\n');
  }
  const template = cachedTemplates(seq.channelId)?.templates.find((tpl) => tpl.id === step.templateId || tpl.name === step.templateName);
  if (!template) return '';
  const parsed = parseTemplate(template.components);
  const values = resolveValues(slotsOf(parsed), step.mapping, lead, ctx);
  const header = parsed.header.format === 'TEXT' ? fill(parsed.header.text, (n) => values[`header:${n}`]) : '';
  const body = fill(parsed.body, (n) => values[`body:${n}`]);
  return [header && `*${header}*`, body, parsed.footer].filter(Boolean).join('\n\n');
};

/** Pending tasks of this series for this lead (it is "running"). */
export const isRunningManually = async (sequenceId: string, contactId: string): Promise<boolean> => {
  const { storeId, collectionId } = await collectionRef('waTasks');
  const res = await crm().dataStoreRecords.search(storeId, collectionId, { filter: { sequence_id: sequenceId, contact_id: contactId, status: 'pending' }, rows: 1 });
  return res.data.length > 0;
};

/** A phone notification at a task's due time, opening the "WhatsApp to send" list. */
const notify = async (task: { id?: string; contactName: string; phone: string; text: string; dueAt: string; accountId?: string | null }) => {
  if (Platform.OS === 'web') return;
  const due = new Date(task.dueAt);
  if (due.getTime() <= Date.now() + 30_000) return;
  await Notifications.scheduleNotificationAsync({
    // Same id on every phone and re-arm, so a task never rings twice.
    ...(task.id ? { identifier: `watask:${task.id}` } : {}),
    content: {
      title: `WhatsApp ${task.contactName || task.phone}`,
      body: task.text.slice(0, 140),
      data: { url: `${env.appScheme}://wa-tasks`, accountId: (task.accountId === undefined ? activeAccountId() : task.accountId) ?? undefined },
      sound: 'default',
    },
    // The reminders channel (high importance), not Android's quiet fallback channel.
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: due, channelId: REMINDER_CHANNEL },
  }).catch(() => undefined);
};

/**
 * Starts a series on a lead as WhatsApp tasks, one per step, due at the
 * series' delays from now. The lead's owner (or whoever starts it) sends them.
 * Returns how many tasks were created.
 */
export const startManualSequence = async (
  seq: Sequence,
  lead: Lead,
  ctx: Ctx,
  /** Service reminders: delays count from the visit (steps already past are left out), tagged with the run. `acct`: the account. */
  opts: { from?: Date; runId?: string; acct?: string | null } = {},
): Promise<number> => {
  if (!seq.steps.length) throw new Error('This sequence has no steps');
  if (!lead.phone) throw new Error('This lead has no WhatsApp number');
  const acct = opts.acct === undefined ? activeAccountId() : opts.acct;
  const { storeId, collectionId } = await collectionRef('waTasks', acct);
  // Who sends it when the lead has no owner: me, as signed in to that account.
  const me = useAccountsStore.getState().sessions.find((s) => s.id === acct)?.userId || myUserId();
  const steps = expandedSteps(seq);
  const offsets = cumulativeMinutes(steps);
  const start = opts.from?.getTime() ?? Date.now();
  const sender = lead.agentId || me;
  const made: { id: string; text: string; dueAt: string }[] = [];
  try {
    for (const [i, step] of steps.entries()) {
      if (opts.from && start + offsets[i] * 60_000 < Date.now()) continue;
      const text = stepText(seq, step, lead, ctx);
      if (!text) continue;
      const dueAt = new Date(start + offsets[i] * 60_000).toISOString();
      const conditions = [seq.keepIf, step.onlyIf].filter((f): f is LeadFilter => !!f && Object.keys(f).length > 0);
      const res = await crmFor(acct).dataStoreRecords.insert(storeId, collectionId, {
        record: cleanRecord({
          contact_id: lead.id,
          contact_name: lead.name,
          phone: lead.phone,
          sequence_id: seq.id,
          sequence_name: seq.name,
          step_index: i,
          text,
          due_at: dueAt,
          member_id: sender,
          status: 'pending',
          conditions_json: conditions.length ? JSON.stringify(conditions) : '',
          on_fail: seq.onFail,
          run_id: opts.runId,
        }),
      });
      if (res.ids[0]) made.push({ id: res.ids[0], text, dueAt });
    }
  } catch (err) {
    // Half a series would read as "already running" and block a retry: take back what was made.
    await Promise.all(made.map((m) => crmFor(acct).dataStoreRecords.remove(storeId, collectionId, m.id).catch(() => undefined)));
    throw err;
  }
  // Alarms only on the phone of whoever sends them; the owner's phone arms them on its next open.
  if (sender === me) for (const m of made) void notify({ id: m.id, contactName: lead.name, phone: lead.phone, text: m.text, dueAt: m.dueAt, accountId: acct });
  return made.length;
};

/**
 * Marks a task done. Storage stays small (the data store has a quota):
 *  - sent: kept as the log (who, when, which series and step, that it went out), without the
 *    message text and conditions, which only mattered before sending;
 *  - skipped / cancelled: deleted, nothing worth keeping.
 */
export const markTask = async (id: string, status: WaTaskStatus) => {
  const { storeId, collectionId } = await collectionRef('waTasks');
  const api = crm().dataStoreRecords;
  if (status === 'skipped' || status === 'cancelled') await api.remove(storeId, collectionId, id);
  else if (status === 'sent') await api.update(storeId, collectionId, id, { record: { status, done_at: new Date().toISOString(), text: null, conditions_json: null } });
  // null clears done_at when a task is reopened (an update only sets the fields it is given).
  else await api.update(storeId, collectionId, id, { record: { status, done_at: null } });
  if (status !== 'pending') unarm(id);
};

/* ---- Marks made on the phone, sent to the server when it can be reached ---- */

type PendingMark = { id: string; status: WaTaskStatus };
const MARKS_KEY = 'watasks.marks.v1';
const readMarks = (acct?: string | null) => readJson<PendingMark[]>(MARKS_KEY, acct) ?? [];
const writeMarks = (rows: PendingMark[], acct?: string | null) => writeJson(MARKS_KEY, rows, acct);

/** Tasks marked sent / skipped on the phone whose change hasn't reached the server yet: hidden from the lists. */
const markedIds = () => new Set(readMarks().map((m) => m.id));

/**
 * Marks a task, offline-first: hidden and unarmed on the phone at once, sent to the server now or
 * by `flushTaskMarks` later. Never throws, so a message already sent in WhatsApp is never offered again.
 */
export const markTaskQueued = async (id: string, status: Exclude<WaTaskStatus, 'pending'>): Promise<void> => {
  const acct = activeAccountId();
  writeMarks([...readMarks(acct).filter((m) => m.id !== id), { id, status }], acct);
  unarm(id);
  try {
    await markTask(id, status);
    writeMarks(readMarks(acct).filter((m) => m.id !== id), acct);
  } catch (err) {
    // Gone on the server, or refused outright: nothing left to send.
    if (err instanceof CrmApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429)
      writeMarks(readMarks(acct).filter((m) => m.id !== id), acct);
  }
};

/** Sends the marks made offline (one account's). Returns how many went through. */
export const flushTaskMarks = async (acct: string | null): Promise<number> => {
  let done = 0;
  for (const m of readMarks(acct)) {
    try {
      const { storeId, collectionId } = await collectionRef('waTasks', acct);
      const api = crmFor(acct).dataStoreRecords;
      if (m.status === 'sent') await api.update(storeId, collectionId, m.id, { record: { status: 'sent', done_at: new Date().toISOString(), text: null, conditions_json: null } });
      else await api.remove(storeId, collectionId, m.id);
      done += 1;
    } catch (err) {
      const permanent = err instanceof CrmApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
      if (!permanent) return done;
    }
    writeMarks(readMarks(acct).filter((x) => x.id !== m.id), acct);
  }
  return done;
};

const unarm = (id: string) => {
  if (Platform.OS !== 'web') void Notifications.cancelScheduledNotificationAsync(`watask:${id}`).catch(() => undefined);
};

/** Every still-pending task of one series run (used when its condition fails and the series is set to stop). */
const cancelRun = async (task: WaTask) => {
  const { storeId, collectionId } = await collectionRef('waTasks');
  const res = await crm().dataStoreRecords.search(storeId, collectionId, {
    filter: task.runId ? { run_id: task.runId, status: 'pending' } : { sequence_id: task.sequenceId, contact_id: task.contactId, status: 'pending' },
    rows: 100,
  });
  await Promise.all(res.data.map((r) => markTask(String(r.id), 'cancelled')));
};

/**
 * The signed-in member's pending tasks due by the end of today (missed ones
 * from earlier days included), oldest first. Tasks whose lead no longer
 * matches the series condition are skipped (or the rest of that run is
 * cancelled, if the series says so) and left out.
 */
export const listDueTasks = async (opts: { contactId?: string; upcoming?: boolean } = {}): Promise<WaTask[]> => {
  const { storeId, collectionId } = await collectionRef('waTasks');
  const me = myUserId();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const filter: Record<string, unknown> = { status: 'pending' };
  if (opts.contactId) filter.contact_id = opts.contactId;
  else filter.member_id = me;
  if (!opts.upcoming) filter.due_at = { $lte: endOfToday.toISOString() };
  const out: WaTask[] = [];
  const marked = markedIds();
  for (let page = 1; page <= 5; page += 1) {
    const res = await crm().dataStoreRecords.search(storeId, collectionId, { filter, sort: 'due_at', order: 'asc', page, rows: 100 });
    out.push(...res.data.map((r) => taskFromRecord(r as Record<string, unknown>)).filter((x) => !marked.has(x.id)));
    if (page >= res.pagination.pages) break;
  }
  // Conditions: check each lead once.
  const withConditions = out.filter((x) => x.conditions.length);
  if (!withConditions.length) return out;
  // null: the contact is gone (404). undefined: couldn't check now (offline…): keep the task, check next time.
  const leads = new Map<string, Lead | null | undefined>();
  await Promise.all(
    [...new Set(withConditions.map((x) => x.contactId))].map(async (id) =>
      leads.set(id, await getLead(id).catch((e: unknown) => (e instanceof CrmApiError && e.status === 404 ? null : undefined))),
    ),
  );
  const keep: WaTask[] = [];
  for (const task of out) {
    const lead = task.conditions.length ? leads.get(task.contactId) : undefined;
    if (lead === null) {
      // The lead is gone: nothing to send.
      void markTask(task.id, 'cancelled').catch(() => undefined);
      continue;
    }
    if (lead && !task.conditions.every((c) => leadMatches(lead, c))) {
      void (task.onFail === 'cancel_series' ? cancelRun(task) : markTask(task.id, 'skipped')).catch(() => undefined);
      continue;
    }
    keep.push(task);
  }
  return keep;
};

/** Counts for the Leads page card: due today and overdue (from earlier days). */
export const dueTaskCounts = async (): Promise<{ today: number; overdue: number }> => {
  const tasks = await listDueTasks();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const overdue = tasks.filter((x) => Date.parse(x.dueAt) < startOfToday.getTime()).length;
  return { today: tasks.length - overdue, overdue };
};

/** Removes the pending tasks of one run (a new visit restarted it, or it was stopped): never sent, nothing to keep. */
export const cancelRunTasks = async (runId: string, acct?: string | null) => {
  const { storeId, collectionId } = await collectionRef('waTasks', acct);
  const api = crmFor(acct);
  const res = await api.dataStoreRecords.search(storeId, collectionId, { filter: { run_id: runId, status: 'pending' }, rows: 100 });
  res.data.forEach((r) => unarm(String(r.id)));
  await Promise.all(res.data.map((r) => api.dataStoreRecords.remove(storeId, collectionId, String(r.id))));
};

/**
 * Notifications live on the phone, tasks in the data store: on app open, arm
 * the signed-in member's tasks due in the next week (any phone, after a
 * reinstall too) and drop alarms of tasks that were sent, skipped or cancelled.
 */
export const rearmTaskNotifications = async () => {
  if (Platform.OS === 'web' || !featuresOf().followups) return;
  const { storeId, collectionId } = await collectionRef('waTasks');
  const me = myUserId();
  const until = new Date(Date.now() + 7 * 86400_000).toISOString();
  const res = await crm().dataStoreRecords.search(storeId, collectionId, {
    filter: { member_id: me, status: 'pending', due_at: { $gte: new Date().toISOString(), $lte: until } },
    sort: 'due_at',
    order: 'asc',
    rows: 100,
  });
  const marked = markedIds();
  const tasks = res.data.map((r) => taskFromRecord(r as Record<string, unknown>)).filter((x) => !marked.has(x.id));
  const keep = new Set(tasks.map((x) => `watask:${x.id}`));
  const armed = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  // Drop stale alarms only when this list is complete, and only this account's own.
  const acct = activeAccountId();
  if (me && res.data.length < 100)
    await Promise.all(
      armed
        .filter((n) => n.identifier.startsWith('watask:') && !keep.has(n.identifier) && (n.content.data as { accountId?: string } | undefined)?.accountId === acct)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined)),
    );
  const have = new Set(armed.map((n) => n.identifier));
  for (const task of tasks) if (!have.has(`watask:${task.id}`)) await notify(task);
};
