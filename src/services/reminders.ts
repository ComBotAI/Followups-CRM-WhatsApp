/**
 * Reminder actions, everywhere a reminder shows: the reminder itself, its
 * notification, and the lead's next follow-up date, so the lead leaves (or
 * joins) "due today", overdue and the Today queue as well.
 *
 * Everything is saved on the phone first and resolves at once; uploads and the
 * lead update run in the background (`onLeadChanged` gets the updated lead).
 */
import { Platform } from 'react-native';

import { getLead, updateLead, type Lead } from '@/services/crm/leads';
import {
  completeReminder,
  deleteReminder,
  findReminder,
  isCallReminder,
  localReminders,
  saveReminder,
  setReminderNotification,
  type Reminder,
} from '@/services/crm/records';
import {
  armedReminderNotifications,
  cancelReminderNotification,
  hasNotificationPermission,
  scheduleReminderNotification,
} from '@/services/notifications';
import { activeAccountId } from '@/stores/accounts';

export type LeadChanged = (lead: Lead) => void;

/** The fields a new (or edited) reminder is made from. */
export type ReminderInput = Omit<Reminder, 'id' | 'synced' | 'done' | 'done_at' | 'notification_id' | 'dirty' | 'deleted'>;

const asReminder = (input: ReminderInput, id = ''): Reminder => ({ ...input, id, done: false, done_at: '', synced: false });

/**
 * Creates a reminder, or with `id` moves an existing one (its old alarm is
 * cancelled). Saved on the phone and armed before it resolves; the upload and
 * the lead's follow-up date follow in the background.
 */
export const putReminder = async (input: ReminderInput & { id?: string }, onLeadChanged?: LeadChanged): Promise<void> => {
  const previous = input.id ? findReminder(input.id) : undefined;
  if (previous?.notification_id) await cancelReminderNotification(previous.notification_id);
  const nid = await scheduleReminderNotification(asReminder(input, previous?.id ?? ''));
  // Written to the phone synchronously; the returned promise is only the upload.
  void saveReminder({ ...input, id: previous?.id, notification_id: nid ?? undefined });
  const contactId = input.contact_id;
  if (!contactId) return;
  if (isCallReminder(input)) void syncLeadFollowUp(contactId).then((l) => l && onLeadChanged?.(l));
  // Was a call reminder, now a task: the lead's date may have come from it.
  else if (previous && isCallReminder(previous) && !previous.done)
    void syncLeadFollowUp(contactId, { closedDue: [previous.due_at] }).then((l) => l && onLeadChanged?.(l));
};

/** Moves a reminder to a new time (snooze). */
export const rescheduleReminder = (r: Reminder, due: Date, onLeadChanged?: LeadChanged) => {
  const { id, synced: _s, done: _d, done_at: _da, notification_id: _n, dirty: _x, deleted: _y, ...fields } = r;
  return putReminder({ ...fields, id, due_at: due.toISOString() }, onLeadChanged);
};

/** Ticks a reminder done (or open again). Resolves once it is saved on the phone. */
export const toggleReminderDone = async (r: Reminder, onLeadChanged?: LeadChanged): Promise<void> => {
  // The phone's current row: the one on screen may be stale (its alarm id, or its id after upload).
  const cur = findReminder(r.id) ?? r;
  const done = !cur.done;
  const updated = await completeReminder(cur.id, done);
  if (!updated) return;
  if (done) {
    await cancelReminderNotification(cur.notification_id);
    setReminderNotification(updated.id, undefined);
  } else {
    // Keep the new id so ticking it done again cancels the right notification.
    const nid = await scheduleReminderNotification(updated);
    setReminderNotification(updated.id, nid ?? undefined);
  }

  // Tasks never set the follow-up, so ticking one leaves it as it is.
  if (cur.contact_id && isCallReminder(cur))
    void syncLeadFollowUp(cur.contact_id, done ? { closedDue: [cur.due_at] } : {}).then((l) => l && onLeadChanged?.(l));
};

/** Deletes a reminder, its notification, and (for a call) moves the lead's follow-up to the next one. */
export const removeReminder = async (r: Reminder, onLeadChanged?: LeadChanged): Promise<void> => {
  const cur = findReminder(r.id) ?? r;
  await cancelReminderNotification(cur.notification_id);
  await deleteReminder(cur.id);
  if (cur.contact_id && isCallReminder(cur) && !cur.done)
    void syncLeadFollowUp(cur.contact_id, { closedDue: [cur.due_at] }).then((l) => l && onLeadChanged?.(l));
};

/**
 * Today's "done" for a lead: ticks its call reminders due by tonight and, with
 * `next`, sets a new call reminder then. The lead's follow-up becomes the next
 * open one (or clears). Resolves once the phone is updated; returns the updated lead.
 */
export const completeFollowUp = async (
  base: { contact_id: string; contact_name: string; phone: string; member_id: string; member_name: string },
  next: { at: Date; note: string } | null,
): Promise<Lead | null> => {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const due = localReminders().filter(
    (r) => r.contact_id === base.contact_id && !r.done && isCallReminder(r) && Date.parse(r.due_at) <= endOfToday.getTime(),
  );
  for (const r of due) {
    await completeReminder(r.id, true);
    await cancelReminderNotification(r.notification_id);
    setReminderNotification(r.id, undefined);
  }
  if (next) {
    const input: ReminderInput = { ...base, note: next.note, due_at: next.at.toISOString(), kind: undefined };
    const nid = await scheduleReminderNotification(asReminder(input));
    void saveReminder({ ...input, notification_id: nid ?? undefined });
  }
  return syncLeadFollowUp(base.contact_id, { force: true });
};

const SAME_MS = 60_000;

/**
 * Moves the lead's follow-up to the earliest open call reminder on this phone,
 * or clears it when none is left. Returns the updated lead, or null when
 * nothing changed.
 *
 * `closedDue`: a reminder was just closed (done, deleted, made a task). This
 * phone only has the signed-in member's reminders, so the lead is touched only
 * when its date came from what was closed: a teammate's follow-up stays.
 * `force`: an explicit "done / next" for this lead, which always applies.
 */
export const syncLeadFollowUp = async (contactId: string, opts: { closedDue?: string[]; force?: boolean } = {}): Promise<Lead | null> => {
  const next = localReminders().find((x) => x.contact_id === contactId && !x.done && isCallReminder(x));
  const lead = await getLead(contactId).catch(() => null);
  if (!lead) return null;
  const target = next ? new Date(next.due_at) : null;
  const cur = lead.nextFollowUp?.getTime() ?? null;
  if (cur === (target?.getTime() ?? null)) return null;
  if (!opts.force && opts.closedDue) {
    const fromClosed = cur !== null && opts.closedDue.some((d) => Math.abs(Date.parse(d) - cur) < SAME_MS);
    if (!fromClosed && !(cur === null && target)) return null;
  }
  return updateLead(lead, { nextFollowUp: target, followUpNote: next?.note ?? '' }).catch(() => null);
};

/**
 * Notifications live on the phone, reminders in the data store: arms every
 * open reminder ahead that has no alarm here (made on another phone, after a
 * reinstall), moves alarms of reminders rescheduled elsewhere, and drops
 * alarms nothing points at any more. Never asks for permission.
 */
let rearming: Promise<void> | null = null;
export const rearmReminderNotifications = (): Promise<void> => {
  rearming ??= rearm()
    .catch(() => undefined)
    .finally(() => {
      rearming = null;
    });
  return rearming;
};

const rearm = async () => {
  if (Platform.OS === 'web' || !(await hasNotificationPermission())) return;
  const acct = activeAccountId();
  const armed = await armedReminderNotifications(acct);
  const now = Date.now();
  for (const r of localReminders()) {
    if (r.done || !(Date.parse(r.due_at) > now)) continue;
    const at = r.notification_id ? armed.get(r.notification_id) : undefined;
    if (at !== undefined && (at === '' || at === r.due_at)) continue;
    if (at !== undefined) await cancelReminderNotification(r.notification_id);
    // Switched account meanwhile: this list belongs to the other one.
    if (activeAccountId() !== acct) return;
    const nid = await scheduleReminderNotification(r);
    setReminderNotification(r.id, nid ?? undefined);
  }
  if (activeAccountId() !== acct) return;
  // Read again after every await: an alarm armed just now is already on its row.
  const wanted = new Set(
    localReminders()
      .filter((r) => !r.done && r.notification_id)
      .map((r) => r.notification_id!),
  );
  await Promise.all([...armed.keys()].filter((id) => !wanted.has(id)).map((id) => cancelReminderNotification(id)));
};
