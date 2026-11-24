/**
 * Auto follow-ups: WhatsApp drip sequences.
 *
 * A sequence *definition* (steps, delays, conditions, auto-start rule) is
 * this app's own record, kept in the "Follow-up sequences" data-store
 * collection so the whole team shares it. *Starting* a sequence on a lead
 * creates a CPaaS scheduled-message series for that contact: one row per
 * step, each re-checking the lead just before it sends, so a lead that
 * converts stops receiving the rest without anyone cancelling anything.
 *
 * Auto-start rules ("when a lead is marked Won") are evaluated by the app
 * when it makes the change; CPaaS has no trigger for them.
 */
import type { ContactFilter, ScheduledMessage, Template } from '@ab-ecosystem/cpaas';

import { andFilters, buildContactFilter, countActiveFilters, MAX_CONDITIONS, type LeadFilter } from '@/lib/filters';
import { readJson, writeJson } from '@/services/storage';
import { activeAccountId, activeSession, useAccountsStore } from '@/stores/accounts';
import { visitsConfig } from '@/stores/visits';
import { useAuthStore } from '@/stores/auth';
import { whatsAppConfig, type VariableSource } from '@/stores/whatsapp';
import { crm, crmFor } from './client';
import { collectionRef } from './datastore';
import type { Lead } from './leads';
import { isRunningManually, startManualSequence } from './waTasks';
import { parseTemplate, resolveValues, sessionContent, slotsOf, templateContent, timezoneName, type MediaFormat, type SendCtx, type SessionType } from './whatsapp';
import { featuresOf } from '@/stores/features';

export type DelayUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
export const DELAY_UNITS: DelayUnit[] = ['minutes', 'hours', 'days', 'weeks', 'months'];
/** A month counts as 30 days. */
export const MINUTES: Record<DelayUnit, number> = { minutes: 1, hours: 60, days: 1440, weeks: 10080, months: 43200 };

/** A free-form (non-template) WhatsApp message: text, or media with a caption. */
export type SessionMessage = {
  type: SessionType;
  /** Text body, or the caption under media. May contain `[[field]]` tokens. */
  text: string;
  media?: { link: string; filename?: string; mimeType?: string };
};

export type SequenceStep = {
  id: string;
  /** Wait after the previous step (the first step: after the start). */
  wait: { value: number; unit: DelayUnit };
  /** `template` (default, older steps have none) or a session message. */
  kind?: 'template' | 'session';
  session?: SessionMessage;
  templateId: string;
  templateName: string;
  language: string;
  mapping: Record<string, VariableSource>;
  headerMedia?: { format: MediaFormat; link: string; filename?: string };
  /** Extra condition for this step only. */
  onlyIf?: LeadFilter;
};

export type SequenceTrigger =
  | { kind: 'manual' }
  | { kind: 'status'; status: string }
  | { kind: 'created' }
  /** A visit with this service is recorded: starts, or restarts, the customer's run (see services.ts). */
  | { kind: 'service'; serviceId: string }
  /** Any visit is recorded: (re)starts the run, e.g. a thank-you and a "we miss you" that only fires if they don't return. */
  | { kind: 'visit' }
  /** The guest's Nth visit (a reward, once). */
  | { kind: 'milestone'; visits: number }
  /**
   * A yearly date on the contact (`birthday`, `anniversary` or a date field the user added): starts
   * `daysBefore` days ahead of it, every year.
   */
  | { kind: 'occasion'; field: string; daysBefore: number };

/** After the last step, send it again every `every` `unit`, up to `times` more times. */
export type SequenceRepeat = { every: number; unit: DelayUnit; times: number };

export type Sequence = {
  id: string;
  name: string;
  description: string;
  channelId: string;
  steps: SequenceStep[];
  /** Keep sending only while the lead matches. Empty = always. */
  keepIf: LeadFilter;
  onFail: 'skip' | 'cancel_series';
  trigger: SequenceTrigger;
  active: boolean;
  createdBy: string;
  /** Service reminders: keep reminding after the last step (null = stop). */
  repeat?: SequenceRepeat | null;
};

const json = <T>(v: unknown, fallback: T): T => {
  try {
    return typeof v === 'string' && v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const sequenceFromRecord = (r: Record<string, unknown>): Sequence => ({
  id: String(r.id),
  name: String(r.name ?? ''),
  description: String(r.description ?? ''),
  channelId: String(r.channel_id ?? ''),
  steps: json<SequenceStep[]>(r.steps_json, []),
  keepIf: json<LeadFilter>(r.condition_json, {}),
  onFail: r.on_fail === 'cancel_series' ? 'cancel_series' : 'skip',
  trigger: json<SequenceTrigger>(r.trigger_json, { kind: 'manual' }),
  active: r.active !== false,
  createdBy: String(r.created_by ?? ''),
  repeat: json<SequenceRepeat | null>(r.repeat_json, null),
});

const toRecord = (s: Omit<Sequence, 'id'>) => ({
  name: s.name.trim(),
  description: s.description.trim(),
  channel_id: s.channelId,
  steps_json: JSON.stringify(s.steps),
  condition_json: JSON.stringify(s.keepIf),
  on_fail: s.onFail,
  trigger_json: JSON.stringify(s.trigger),
  active: s.active,
  created_by: s.createdBy,
  repeat_json: s.repeat ? JSON.stringify(s.repeat) : '',
});

const CACHE_KEY = 'sequences.cache.v1';
const CACHE_AT_KEY = 'sequences.cachedAt.v1';
const cache = (): Sequence[] => readJson<Sequence[]>(CACHE_KEY) ?? [];

/** `acct` pins it to one account (background work); the cache is that account's. */
export const listSequences = async (acct?: string | null): Promise<Sequence[]> => {
  const id = acct === undefined ? activeAccountId() : acct;
  const { storeId, collectionId } = await collectionRef('sequences', id);
  const res = await crmFor(id).dataStoreRecords.list(storeId, collectionId, { rows: 100 });
  const list = res.data.map((r) => sequenceFromRecord(r as Record<string, unknown>));
  writeJson(CACHE_KEY, list, id);
  writeJson(CACHE_AT_KEY, Date.now(), id);
  return list;
};

export const saveSequence = async (s: Omit<Sequence, 'id'> & { id?: string }): Promise<string> => {
  const { storeId, collectionId } = await collectionRef('sequences');
  const api = crm().dataStoreRecords;
  if (s.id) {
    await api.update(storeId, collectionId, s.id, { record: toRecord(s) });
    return s.id;
  }
  const res = await api.insert(storeId, collectionId, { record: toRecord(s) });
  return res.ids[0] ?? '';
};

export const deleteSequence = async (id: string) => {
  const { storeId, collectionId } = await collectionRef('sequences');
  await crm().dataStoreRecords.remove(storeId, collectionId, id);
  writeJson(
    CACHE_KEY,
    cache().filter((s) => s.id !== id),
  );
};

/** Total minutes from the start to each step (CPaaS offsets are cumulative). */
export const cumulativeMinutes = (steps: Pick<SequenceStep, 'wait'>[]): number[] => {
  let total = 0;
  return steps.map((s) => (total += Math.max(0, s.wait.value) * MINUTES[s.wait.unit]));
};

/** The steps with the repeat appended: copies of the last step, `every` apart. */
export const expandedSteps = (seq: Pick<Sequence, 'steps' | 'repeat'>): SequenceStep[] => {
  const last = seq.steps[seq.steps.length - 1];
  if (!last || !seq.repeat || seq.repeat.times <= 0 || seq.repeat.every <= 0) return seq.steps;
  const extra = Array.from({ length: Math.min(seq.repeat.times, 50) }, (_, i) => ({
    ...last,
    id: `${last.id}~r${i + 1}`,
    wait: { value: seq.repeat!.every, unit: seq.repeat!.unit },
  }));
  return [...seq.steps, ...extra];
};

/** When each step is due, counted from `from`. */
export const dueDates = (seq: Pick<Sequence, 'steps' | 'repeat'>, from: Date): Date[] =>
  cumulativeMinutes(expandedSteps(seq)).map((m) => new Date(from.getTime() + m * 60_000));

/** A tag in the series title so the app can find a lead's run of a sequence. */
const marker = (id: string) => `seq:${id}`;

export const isRunningFor = async (sequenceId: string, contactId: string): Promise<boolean> => {
  const res = await crm().scheduledMessages.list({ contact: contactId, status: 'pending', search: marker(sequenceId), rows: 1 });
  return res.data.length > 0;
};

/** Starts a sequence for one lead: one scheduled message per step. */
export const startSequence = async (
  seq: Sequence,
  lead: Lead,
  ctx: SendCtx,
  /** Service reminders: count the delays from the visit (steps already past are left out), with its own title. `acct`: the account it runs in. */
  opts: { from?: Date; title?: string; acct?: string | null } = {},
) => {
  const api = crmFor(opts.acct);
  if (!seq.steps.length) throw new Error('This sequence has no steps');
  seq = { ...seq, steps: expandedSteps(seq) };
  // A series made with the phone app has no channel yet: send from the account's channel.
  const channelId = seq.channelId || whatsAppConfig(opts.acct).channelId || '';
  if (!channelId) throw new Error('Pick a WhatsApp channel in WhatsApp settings first');
  seq = { ...seq, channelId };
  const templates = new Map<string, Template>();
  for (const st of seq.steps) {
    if (st.kind === 'session') continue;
    if (!templates.has(st.templateId)) templates.set(st.templateId, await api.templates.get(seq.channelId, st.templateId));
  }
  // Minutes from now to each step: a visit logged late has some already behind it (elapsed > 0);
  // a series armed ahead (next birthday) starts later (elapsed < 0, so every step moves out).
  const elapsed = opts.from ? (Date.now() - opts.from.getTime()) / 60_000 : 0;
  const all = cumulativeMinutes(seq.steps).map((m) => m - elapsed);
  const keepIdx = all.map((m, i) => (m >= 0 ? i : -1)).filter((i) => i >= 0);
  if (!keepIdx.length) return null;
  const offsets = keepIdx.map((i) => Math.round(all[i]));
  const keep = await resolveCondition(seq.keepIf, opts.acct);
  const stepConds = await Promise.all(seq.steps.map((st) => resolveCondition(st.onlyIf, opts.acct)));
  return api.scheduledMessages.createSeries({
    title: `${opts.title ?? seq.name} · ${marker(seq.id)}`,
    channel: seq.channelId,
    contact: { id: lead.id },
    timezone: timezoneName(),
    // A minute of slack so a "send immediately" first step is still in the future.
    starts_at: new Date(Date.now() + 60_000).toISOString(),
    // Always say what a failed check does: the default would cancel the series even for a step-only condition.
    on_condition_fail: seq.onFail,
    ...(keep ? { conditions: keep } : {}),
    steps: keepIdx.map((idx, i) => {
      const st = seq.steps[idx];
      let content: Record<string, unknown>;
      if (st.kind === 'session' && st.session) content = sessionContent(st.session, lead, ctx);
      else {
        const template = templates.get(st.templateId)!;
        const values = resolveValues(slotsOf(parseTemplate(template.components)), st.mapping, lead, ctx);
        content = templateContent(template, values, st.headerMedia);
      }
      return {
        after: { value: offsets[i], unit: 'minutes' as const },
        content: content as never,
        ...(stepConds[idx] ? { conditions: stepConds[idx] } : {}),
      };
    }),
  });
};

// ---------- conditions ----------

/**
 * A lead filter as a ContactFilter a schedule can check. A schedule's
 * condition cannot point at a segment, so a chosen segment's own conditions
 * are copied in and combined with the other choices (see `andFilters`).
 * Returns undefined when the filter is empty (always send).
 */
/** Why a follow-up condition can't be used, or null. Checked when the series is saved and again when it runs. */
export const conditionProblem = (f: LeadFilter | undefined): string | null =>
  // A scheduled message can't check who a lead is assigned to; better to say so than to ignore it.
  f?.agent && f.agent !== 'unassigned' ? '"Assigned to" can\'t be used in a follow-up condition. Remove it and try again.' : null;

/**
 * Fields of a condition that the 50-rule limit narrows to their first pick (see
 * `buildContactFilter`): the series would then check fewer choices than were picked.
 */
export const conditionNarrowed = (f: LeadFilter | undefined): string[] => {
  if (!f || !countActiveFilters(f)) return [];
  const { segment: _segment, search: _search, ...rest } = f;
  return countActiveFilters(rest) ? buildContactFilter(rest).collapsed : [];
};

export const resolveCondition = async (f: LeadFilter | undefined, acct?: string | null): Promise<ContactFilter | undefined> => {
  if (!f || !countActiveFilters(f)) return undefined;
  const problem = conditionProblem(f);
  if (problem) throw new Error(problem);
  const { segment, search: _search, ...rest } = f;
  const restFilter = countActiveFilters(rest) ? buildContactFilter(rest).filter : undefined;
  const segFilter = segment ? (await crmFor(acct).segments.get(segment)).filter : undefined;
  const combined = andFilters(segFilter, restFilter);
  if ((combined.conditions?.length ?? 0) > MAX_CONDITIONS) throw new Error(`The condition is too complex (over ${MAX_CONDITIONS} rules). Pick fewer options.`);
  return combined.conditions?.length ? combined : undefined;
};

// ---------- auto-start rules ----------

export type LeadEvent = { kind: 'status'; lead: Lead; status: string } | { kind: 'created'; lead: Lead };

const matches = (t: SequenceTrigger, e: LeadEvent) =>
  (t.kind === 'status' && e.kind === 'status' && t.status === e.status) ||
  (t.kind === 'created' && e.kind === 'created');

const STARTED_KEY = 'sequences.autostarted.v1';

/**
 * Starts every active sequence whose rule matches the event: as scheduled
 * messages in API mode, as WhatsApp tasks with the phone app. Never throws: a failed
 * auto-start must not break the edit that caused it.
 */
export const runAutoStart = async (e: LeadEvent, ctx: { myName: string; workspace: string }): Promise<string[]> => {
  if (!e.lead.id || !featuresOf().followups) return [];
  // Phone WhatsApp: the series becomes "WhatsApp to send" tasks the owner sends by hand.
  const manual = whatsAppConfig().mode !== 'api';
  const started: string[] = [];
  // The phone's copy, refreshed every 10 minutes (rules change on other devices too).
  let list = cache();
  if (!list.length || Date.now() - (readJson<number>(CACHE_AT_KEY) ?? 0) > 10 * 60_000) list = await listSequences().catch(() => list);
  const done = readJson<Record<string, number>>(STARTED_KEY) ?? {};
  for (const seq of list.filter((s) => s.active && s.trigger.kind !== 'manual' && matches(s.trigger, e))) {
    const key = `${seq.id}:${e.lead.id}`;
    // Same rule, same lead, within a day: already handled.
    if (done[key] && Date.now() - done[key] < 86400_000) continue;
    try {
      if (manual) {
        if (await isRunningManually(seq.id, e.lead.id)) continue;
        await startManualSequence(seq, e.lead, ctx);
      } else {
        if (await isRunningFor(seq.id, e.lead.id)) continue;
        await startSequence(seq, e.lead, ctx);
      }
      done[key] = Date.now();
      started.push(seq.name);
    } catch {
      // Logged nowhere on purpose: the lead edit itself succeeded.
    }
  }
  writeJson(STARTED_KEY, done);
  return started;
};

// ---------- a contact's scheduled messages ----------

export const listContactSchedules = async (contactId: string): Promise<ScheduledMessage[]> => {
  const out: ScheduledMessage[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const res = await crm().scheduledMessages.list({ contact: contactId, page, rows: 100 });
    out.push(...res.data);
    if (page >= res.pagination.pages) break;
  }
  return out;
};

export const cancelScheduled = (id: string) => crm().scheduledMessages.cancel(id);
export const sendScheduledNow = (id: string) => crm().scheduledMessages.sendNow(id);
export const cancelSeries = (series: string) => crm().scheduledMessages.cancelSeries(series);

/** The sequence name from a series title written by `startSequence`. */
export const sequenceNameOf = (title: string) => title.replace(/\s·\sseq:[^\s]+$/, '');

/** Variable context for the signed-in user. */
/** Who is sending, for message fields: my name, the workspace, and its Visits details (`acct`: that account's). */
export const senderContext = (acct?: string | null): SendCtx => {
  const { profile } = useAuthStore.getState();
  const id = acct === undefined ? activeAccountId() : acct;
  const session = useAccountsStore.getState().sessions.find((s) => s.id === id) ?? activeSession();
  const v = visitsConfig(id);
  // The profile is the signed-in user on screen; another account (or a background start) uses its own login.
  const fromProfile = id === activeAccountId() ? [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email : '';
  return {
    myName: fromProfile || session?.name || session?.email || '',
    workspace: session?.workspaceName ?? '',
    business: v.business,
    reviewLink: v.reviewLink,
  };
};

/**
 * Call after the app creates or changes a lead. Fires the matching auto-start
 * rules in the background; returns the names of sequences started.
 */
export const afterLeadChange = (prev: Lead | null, next: Lead): Promise<string[]> => {
  const ctx = senderContext();
  const events: LeadEvent[] = [];
  if (!prev) events.push({ kind: 'created', lead: next });
  if (next.status && next.status !== prev?.status) events.push({ kind: 'status', lead: next, status: next.status });
  return events.reduce<Promise<string[]>>(async (acc, e) => [...(await acc), ...(await runAutoStart(e, ctx))], Promise.resolve([]));
};
