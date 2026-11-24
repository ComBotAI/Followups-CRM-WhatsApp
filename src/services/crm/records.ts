/**
 * Remarks and reminders — two of the smaller data-store tables.
 * Each has a remote path and a local mirror so the UI never waits on the network.
 */
import { readJson, writeJson } from '@/services/storage';
import { activeAccountId } from '@/stores/accounts';
import { crm, crmFor, CrmApiError, isStorageFull } from './client';
import { cleanRecord, collectionRef, fitRecord } from './datastore';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Local ids whose insert is on its way, so a retry pass doesn't insert them a second time.
const inflight = new Set<string>();
const inFlight = async <T>(id: string, fn: () => Promise<T>): Promise<T> => {
  inflight.add(id);
  try {
    return await fn();
  } finally {
    inflight.delete(id);
  }
};

/** A refusal that will not change on retry (bad request), as opposed to being offline. */
// A full store (402 storage_exceeded) is not permanent: the row waits on the phone until space is freed.
const isPermanent = (err: unknown) =>
  err instanceof CrmApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429 && !isStorageFull(err);

/* ---------------------------------- Remarks --------------------------------- */

export type Remark = {
  id: string;
  contact_id: string;
  text: string;
  member_id: string;
  member_name: string;
  created_on: string;
  synced: boolean;
};

const REMARKS_KEY = 'remarks.local.v1';
const readRemarks = (acct?: string | null): Remark[] => readJson<Remark[]>(REMARKS_KEY, acct) ?? [];

export const localRemarks = (contactId: string) => readRemarks().filter((r) => r.contact_id === contactId);

export const addRemark = async (input: Omit<Remark, 'id' | 'created_on' | 'synced'>): Promise<Remark> => {
  const remark: Remark = {
    ...input,
    id: uid(),
    created_on: new Date().toISOString(),
    synced: false,
  };
  // The account it was written in, even if the user switches while it uploads.
  const acct = activeAccountId();
  const rows = readRemarks(acct);
  rows.unshift(remark);
  writeJson(REMARKS_KEY, rows.slice(0, 1000), acct);
  try {
    const { storeId, collectionId } = await collectionRef('remarks', acct);
    const { id: _id, synced: _s, created_on: _c, ...body } = remark;
    const res = await inFlight(remark.id, () => crmFor(acct).dataStoreRecords.insert(storeId, collectionId, { record: cleanRecord(body) }));
    const stored = { ...remark, id: res.ids[0] ?? remark.id, synced: true };
    writeJson(
      REMARKS_KEY,
      readRemarks(acct).map((r) => (r.id === remark.id ? stored : r)),
      acct,
    );
    return stored;
  } catch {
    // Offline, no data store, or refused for now (store full, server error): it is saved on the
    // phone and `retryPendingRecords` uploads it later. Saying "could not save" here made people
    // add it again, and both copies were uploaded.
    return remark;
  }
};

export const fetchRemarks = async (contactId: string): Promise<Remark[]> => {
  const { storeId, collectionId } = await collectionRef('remarks');
  const res = await crm().dataStoreRecords.search(storeId, collectionId, {
    filter: { contact_id: contactId },
    rows: 100,
  });
  return res.data.map((r) => ({
    id: String(r.id),
    contact_id: String(r.contact_id ?? ''),
    text: String(r.text ?? ''),
    member_id: String(r.member_id ?? ''),
    member_name: String(r.member_name ?? ''),
    created_on: toIso(r.created_on),
    synced: true,
  }));
};

/* --------------------------------- Reminders -------------------------------- */

export type Reminder = {
  id: string;
  contact_id: string;
  contact_name: string;
  phone: string;
  note: string;
  due_at: string;
  member_id: string;
  member_name: string;
  done: boolean;
  done_at: string;
  /**
   * What the reminder is for. Only 'call' sets the contact's follow-up and joins
   * the follow-up queue; 'task' (something to do) and 'whatsapp' (a message to
   * send) get their own lists on Today. Missing means 'call'.
   */
  kind?: ReminderKind;
  /** Local notification id, so it can be cancelled. */
  notification_id?: string;
  synced: boolean;
  /** Done / not done changed on the phone and not yet confirmed by the server. */
  dirty?: boolean;
  /** Deleted on the phone; kept (hidden) until the server confirms, so a sync can't bring it back. */
  deleted?: boolean;
};

const REMINDERS_KEY = 'reminders.local.v1';
// `acct` pins a write to the account it started in: an upload can finish after the user switched account.
const readReminders = (acct?: string | null): Reminder[] => readJson<Reminder[]>(REMINDERS_KEY, acct) ?? [];
const writeReminders = (rows: Reminder[], acct?: string | null) => writeJson(REMINDERS_KEY, rows, acct);

export type ReminderKind = 'call' | 'task' | 'whatsapp';
export const REMINDER_KINDS: ReminderKind[] = ['call', 'task', 'whatsapp'];
export const reminderKind = (r: Pick<Reminder, 'kind'>): ReminderKind => (r.kind === 'task' || r.kind === 'whatsapp' ? r.kind : 'call');
export const isCallReminder = (r: Pick<Reminder, 'kind'>) => reminderKind(r) === 'call';

export const localReminders = (): Reminder[] => visible(readReminders()).sort((a, b) => a.due_at.localeCompare(b.due_at));

const visible = (rows: Reminder[]) => rows.filter((r) => !r.deleted);

/**
 * A reminder's local id → the id the server gave it on upload. A screen can still hold the old
 * id for a moment; every action looks it up here so it edits the row instead of making a new one.
 */
const renamed = new Map<string, string>();
const resolveId = (id: string) => renamed.get(id) ?? id;

/** The phone's current copy of a reminder (by its current or former id), or undefined. */
export const findReminder = (id: string): Reminder | undefined => {
  const rid = resolveId(id);
  return readReminders().find((r) => r.id === rid && !r.deleted);
};

// Trimmed to the fields of the account's own table (the write may belong to an account not on screen).
const reminderBody = (r: Reminder, acct: string | null) => {
  const { id: _id, synced: _s, notification_id: _n, dirty: _d, deleted: _x, ...body } = r;
  // Empty values are rejected by the data store, so `done_at` only goes with `done: true`.
  return fitRecord('reminders', cleanRecord({ ...body, done_at: r.done ? r.done_at : '' }), acct);
};
const sameContent = (a: Reminder, b: Reminder) => JSON.stringify(reminderBody(a, null)) === JSON.stringify(reminderBody(b, null));
/** An update is a $set of what it is sent: a field emptied on the phone goes as `null`, or the server keeps the old value. */
const updateBody = (r: Reminder, acct: string | null) => {
  const sent = reminderBody(r, acct);
  const cleared = Object.fromEntries(
    (['note', 'phone', 'contact_name', 'done_at'] as const).filter((k) => !(k in sent)).map((k) => [k, null]),
  );
  return fitRecord('reminders', { ...cleared, ...sent }, acct);
};

/**
 * Saves a reminder on the phone, then on the server. An edit of a reminder the
 * server already has stays "synced" and is marked `dirty` until the update
 * lands, so a failed edit is retried as an update, never inserted again.
 */
export const saveReminder = async (input: Omit<Reminder, 'id' | 'synced' | 'done' | 'done_at'> & { id?: string }): Promise<Reminder> => {
  // Only the reminder's own fields: a caller may pass a whole row (with synced / dirty / done).
  const { id: inputId, synced: _s, dirty: _d, deleted: _x, done: _dn, done_at: _da, ...fields } = input as Partial<Reminder>;
  const existing = inputId ? readReminders().find((r) => r.id === resolveId(inputId) && !r.deleted) : undefined;
  const reminder: Reminder = {
    done: false,
    done_at: '',
    ...existing,
    ...(fields as Omit<Reminder, 'id' | 'synced' | 'done' | 'done_at'>),
    // An id that is gone (deleted meanwhile) starts a new reminder rather than reusing it.
    id: existing?.id ?? uid(),
    synced: existing?.synced ?? false,
    dirty: existing?.synced ? true : undefined,
  };
  writeReminders([...readReminders().filter((r) => r.id !== reminder.id), reminder]);
  // Still being uploaded: that insert keeps this change (it compares and marks the row dirty for an
  // update). A second insert here would make two server records.
  if (inflight.has(reminder.id)) return reminder;
  // Saved on the phone from here on: a failed upload (offline, store full, server error) is
  // retried by `retryPendingRecords`, never reported as "not saved" (that led to duplicates).
  try {
    if (reminder.synced) {
      await pushUpdate(reminder);
      return readReminders().find((r) => r.id === reminder.id) ?? reminder;
    }
    return await insertReminder(reminder);
  } catch {
    return readReminders().find((r) => r.id === resolveId(reminder.id)) ?? reminder;
  }
};

/** Inserts a reminder the server doesn't have yet; changes made meanwhile (e.g. ticked done) are kept and sent next. */
const insertReminder = async (sent: Reminder, acct: string | null = activeAccountId()): Promise<Reminder> => {
  const { storeId, collectionId } = await collectionRef('reminders', acct);
  const res = await inFlight(sent.id, () => crmFor(acct).dataStoreRecords.insert(storeId, collectionId, { record: reminderBody(sent, acct) }));
  const newId = res.ids[0] ?? sent.id;
  if (newId !== sent.id) renamed.set(sent.id, newId);
  const rows = readReminders(acct);
  const cur = rows.find((r) => r.id === sent.id) ?? sent;
  // A sync that ran while this was uploading may already have added the server's copy: one row, not two,
  // keeping the alarm id from whichever copy has it.
  const twin = newId !== sent.id ? rows.find((r) => r.id === newId) : undefined;
  const stored: Reminder = {
    ...cur,
    id: newId,
    notification_id: cur.notification_id ?? twin?.notification_id,
    synced: true,
    dirty: !sameContent(cur, sent) || undefined,
  };
  writeReminders([...rows.filter((r) => r.id !== sent.id && r.id !== newId), stored], acct);
  // Deleted while it was uploading: remove it from the server now, not on the next retry.
  if (stored.deleted) void removeRemote(stored, acct).catch(() => undefined);
  return stored;
};

/** Sends a synced reminder's current state; clears `dirty` only if nothing changed while it was in flight. */
const pushUpdate = async (sent: Reminder, acct: string | null = activeAccountId()) => {
  const { storeId, collectionId } = await collectionRef('reminders', acct);
  await crmFor(acct).dataStoreRecords.update(storeId, collectionId, sent.id, { record: updateBody(sent, acct) });
  writeReminders(
    readReminders(acct).map((x) => (x.id === sent.id && sameContent(x, sent) ? { ...x, dirty: false } : x)),
    acct,
  );
};

/**
 * Marks a reminder done (or open again). Saved on the phone first and never
 * throws; until the server confirms, the phone's version wins over what a sync
 * brings back, and `retryPendingRecords` keeps trying.
 */
export const completeReminder = async (id: string, done = true): Promise<Reminder | null> => {
  const rows = readReminders();
  const rid = resolveId(id);
  const target = rows.find((r) => r.id === rid && !r.deleted);
  id = rid;
  if (!target) return null;
  const updated: Reminder = { ...target, done, done_at: done ? new Date().toISOString() : '', dirty: target.synced };
  writeReminders(rows.map((r) => (r.id === id ? updated : r)));
  // Not on the server yet: `retryPendingRecords` inserts it with its done state.
  if (target.synced) void pushUpdate(updated).catch(() => undefined);
  return updated;
};

/**
 * Deletes a reminder. Gone from the phone at once; on the server now, or by
 * `retryPendingRecords` later. One never uploaded (and not uploading) is just dropped.
 */
export const deleteReminder = async (id: string): Promise<void> => {
  id = resolveId(id);
  const target = readReminders().find((r) => r.id === id);
  if (!target) return;
  if (!target.synced && !inflight.has(id)) return writeReminders(readReminders().filter((r) => r.id !== id));
  writeReminders(readReminders().map((r) => (r.id === id ? { ...r, deleted: true } : r)));
  if (target.synced) await removeRemote(target).catch(() => undefined);
};

const removeRemote = async (r: Reminder, acct: string | null = activeAccountId()) => {
  const { storeId, collectionId } = await collectionRef('reminders', acct);
  try {
    await crmFor(acct).dataStoreRecords.remove(storeId, collectionId, r.id);
  } catch (err) {
    // Already gone on the server counts as done.
    if (!(err instanceof CrmApiError && err.status === 404)) throw err;
  }
  writeReminders(
    readReminders(acct).filter((x) => x.id !== r.id),
    acct,
  );
};

/** Remembers a reminder's scheduled notification (phone only; never sent to the server). */
export const setReminderNotification = (id: string, notificationId: string | undefined) => {
  const rid = resolveId(id);
  writeReminders(readReminders().map((r) => (r.id === rid ? { ...r, notification_id: notificationId } : r)));
};

/** Pulls the signed-in member's open reminders and merges them into the local list. */
export const syncReminders = async (memberId: string): Promise<Reminder[]> => {
  // Profile not loaded yet: an empty member id would match nothing and drop open reminders.
  if (!memberId) return localReminders();
  try {
    const acct = activeAccountId();
    const { storeId, collectionId } = await collectionRef('reminders', acct);
    // The phone's rows as they were when the search went out: one inserted or changed while it was
    // in flight is newer than the reply, so it is kept as it is now.
    const before = new Map(readReminders(acct).map((r) => [r.id, JSON.stringify(r)]));
    const PAGE = 100;
    const res = await crmFor(acct).dataStoreRecords.search(storeId, collectionId, {
      filter: { member_id: memberId, done: false },
      sort: 'due_at',
      order: 'asc',
      rows: PAGE,
    });
    // A full page may not be everything: then an open reminder missing from it is kept, not dropped.
    const complete = res.data.length < PAGE;
    const remote: Reminder[] = res.data.map((r) => ({
      id: String(r.id),
      contact_id: String(r.contact_id ?? ''),
      contact_name: String(r.contact_name ?? ''),
      phone: String(r.phone ?? ''),
      note: String(r.note ?? ''),
      due_at: toIso(r.due_at),
      member_id: String(r.member_id ?? ''),
      member_name: String(r.member_name ?? ''),
      done: !!r.done,
      done_at: toIso(r.done_at),
      kind: r.kind === 'task' || r.kind === 'whatsapp' ? r.kind : undefined,
      synced: true,
    }));
    const local = readReminders(acct);
    const merged = new Map<string, Reminder>();
    for (const r of remote) {
      const mine = local.find((l) => l.id === r.id);
      // `kind` stays on the phone when the table can't hold it yet (see fitRecord).
      merged.set(r.id, { ...r, kind: r.kind ?? mine?.kind, notification_id: mine?.notification_id });
    }
    // Deleted, unsent and changed-but-unconfirmed reminders keep the phone's whole row (it holds the
    // pending change); finished ones stay listed under Done; with a partial page, open ones stay too.
    for (const l of local) {
      if (l.deleted || !l.synced || l.dirty || before.get(l.id) !== JSON.stringify(l)) merged.set(l.id, l);
      else if (!merged.has(l.id) && (l.done || !complete)) merged.set(l.id, l);
      // Gone from the server (deleted or done elsewhere): its alarm goes too.
      else if (!merged.has(l.id) && l.notification_id) void cancelReminderNotificationLazy(l.notification_id);
    }
    const rows = pruneDone([...merged.values()]);
    writeReminders(rows, acct);
    // Reminders new to this phone (made on another one, or after a reinstall) get their alarm here.
    void import('@/services/reminders').then((m) => m.rearmReminderNotifications()).catch(() => undefined);
    return visible(rows);
  } catch {
    return localReminders();
  }
};

/**
 * Finished reminders the server already has are kept for the Done list only: the newest
 * DONE_KEEP within DONE_DAYS. Without a cap the list (read whole on every screen) grew forever.
 */
const DONE_KEEP = 200;
const DONE_DAYS = 30;
export const pruneDone = (rows: Reminder[], now = Date.now()): Reminder[] => {
  const cutoff = now - DONE_DAYS * 86400_000;
  const prunable = (r: Reminder) => r.done && r.synced && !r.dirty && !r.deleted;
  const keepDone = new Set(
    rows
      .filter((r) => prunable(r) && (Date.parse(r.done_at) || 0) >= cutoff)
      .sort((a, b) => b.done_at.localeCompare(a.done_at))
      .slice(0, DONE_KEEP)
      .map((r) => r.id),
  );
  return rows.filter((r) => !prunable(r) || keepDone.has(r.id));
};

// Lazy: notifications imports this module.
const cancelReminderNotificationLazy = (id: string) =>
  import('@/services/notifications').then((m) => m.cancelReminderNotification(id)).catch(() => undefined);

/* ---------------------------------- Sessions -------------------------------- */

const toIso = (v: unknown): string => {
  if (!v) return '';
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};

/**
 * Uploads remarks and reminders saved while offline. Safe to call often: it
 * only touches rows still marked unsynced, and stops at the first network
 * failure (still offline).
 */
let retrying: Promise<number> | null = null;

/**
 * Uploads remarks and reminders saved while offline, and reminder changes the
 * server hasn't confirmed. Safe to call often: one pass runs at a time, rows
 * already being inserted are skipped, a row the server refuses outright is
 * skipped (it doesn't block the rest), and being offline ends the pass.
 */
export const retryPendingRecords = (): Promise<number> => {
  retrying ??= runRetry(activeAccountId(), false).finally(() => {
    retrying = null;
  });
  return retrying;
};

/** Uploads one account's pending records, on screen or not (signing out an account in the background). */
export const flushPendingRecords = (acct: string): Promise<number> => runRetry(acct, true);

const runRetry = async (acct: string | null, pinned: boolean): Promise<number> => {
  let done = 0;
  // The active account's pass stops if the user switches account mid-way (the next pass picks up the rest).
  const attempt = async (fn: () => Promise<unknown>): Promise<boolean> => {
    if (!pinned && activeAccountId() !== acct) return false;
    try {
      await fn();
      done += 1;
      return true;
    } catch (err) {
      if (isPermanent(err)) return true;
      return false;
    }
  };
  for (const r of readRemarks(acct).filter((x) => !x.synced && !inflight.has(x.id))) {
    const ok = await attempt(async () => {
      const { storeId, collectionId } = await collectionRef('remarks', acct);
      const { id, synced: _s, created_on: _c, ...body } = r;
      const res = await inFlight(id, () => crmFor(acct).dataStoreRecords.insert(storeId, collectionId, { record: cleanRecord(body) }));
      writeJson(
        REMARKS_KEY,
        readRemarks(acct).map((x) => (x.id === id ? { ...x, id: res.ids[0] ?? id, synced: true } : x)),
        acct,
      );
    });
    if (!ok) return done;
  }
  // Deleted before they were ever uploaded: nothing to send.
  writeReminders(
    readReminders(acct).filter((x) => !(x.deleted && !x.synced && !inflight.has(x.id))),
    acct,
  );
  for (const r of readReminders(acct).filter((x) => !x.synced && !inflight.has(x.id))) {
    if (!(await attempt(() => insertReminder(r, acct)))) return done;
  }
  for (const r of readReminders(acct).filter((x) => x.synced && x.dirty && !x.deleted)) {
    if (!(await attempt(() => pushUpdate(r, acct)))) return done;
  }
  for (const r of readReminders(acct).filter((x) => x.deleted && x.synced)) {
    if (!(await attempt(() => removeRemote(r, acct)))) return done;
  }
  // "WhatsApp to send" tasks marked sent / skipped while offline.
  done += await import('./waTasks').then((m) => m.flushTaskMarks(acct)).catch(() => 0);
  return done;
};
