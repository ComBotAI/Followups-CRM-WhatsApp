import { pruneDone, saveReminder, localReminders, retryPendingRecords, syncReminders, type Reminder } from '@/services/crm/records';
import { syncLeadFollowUp } from '@/services/reminders';

const mockStore = new Map<string, unknown>();
jest.mock('@/services/storage', () => ({
  readJson: (key: string) => (mockStore.has(key) ? JSON.parse(JSON.stringify(mockStore.get(key))) : null),
  writeJson: (key: string, v: unknown) => void mockStore.set(key, JSON.parse(JSON.stringify(v))),
}));
jest.mock('@/stores/accounts', () => ({
  activeAccountId: () => 'acct',
  useAccountsStore: { getState: () => ({ activeId: 'acct', sessions: [] }) },
}));
jest.mock('@/services/crm/datastore', () => ({
  collectionRef: async () => ({ storeId: 's', collectionId: 'c' }),
  cleanRecord: (b: Record<string, unknown>) => Object.fromEntries(Object.entries(b).filter(([, v]) => v !== '' && v != null)),
  fitRecord: (_k: string, b: unknown) => b,
}));
jest.mock('@/services/notifications', () => ({
  scheduleReminderNotification: async () => null,
  cancelReminderNotification: async () => undefined,
  hasNotificationPermission: async () => false,
  armedReminderNotifications: async () => new Map(),
}));

class MockCrmApiError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}
const mockApi = {
  insert: jest.fn(async (..._a: unknown[]): Promise<{ ids: string[] }> => ({ ids: ['srv1'] })),
  update: jest.fn(async () => ({})),
  remove: jest.fn(async () => ({})),
  search: jest.fn(async (..._a: unknown[]): Promise<{ data: Record<string, unknown>[] }> => ({ data: [] })),
};
jest.mock('@/services/crm/client', () => ({
  crm: () => ({ dataStoreRecords: mockApi }),
  crmFor: () => ({ dataStoreRecords: mockApi }),
  CrmApiError: MockCrmApiError,
  isStorageFull: (e: { status?: number }) => e?.status === 402,
}));

const mockLead = { current: { id: 'L1', nextFollowUp: null as Date | null } };
const mockUpdateLead = jest.fn(async (l: object, input: { nextFollowUp?: Date | null }) => ({ ...l, nextFollowUp: input.nextFollowUp ?? null }));
jest.mock('@/services/crm/leads', () => ({
  getLead: async () => mockLead.current,
  updateLead: (l: object, input: { nextFollowUp?: Date | null }) => mockUpdateLead(l, input),
}));

const base = {
  contact_id: 'L1',
  contact_name: 'Asha',
  phone: '+911234567890',
  note: 'Call',
  member_id: 'me',
  member_name: 'Me',
};

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
  mockLead.current = { id: 'L1', nextFollowUp: null };
});

describe('saveReminder', () => {
  it('keeps the reminder on the phone and never throws when the server refuses it for now', async () => {
    mockApi.insert.mockRejectedValueOnce(new MockCrmApiError(402));
    const r = await saveReminder({ ...base, due_at: new Date(Date.now() + 3600_000).toISOString() });
    expect(r.synced).toBe(false);
    expect(localReminders()).toHaveLength(1);
  });

  it('a sync that lands during the upload does not leave two copies, and the alarm id survives', async () => {
    let release!: (v: { ids: string[] }) => void;
    mockApi.insert.mockImplementationOnce(() => new Promise((res) => (release = res)));
    const pending = saveReminder({ ...base, due_at: new Date(Date.now() + 3600_000).toISOString(), notification_id: 'n1' });
    // The server already has it (the insert went through) and a sync brings it back first.
    mockApi.search.mockResolvedValueOnce({ data: [{ id: 'srv1', ...base, due_at: new Date().toISOString(), done: false }] });
    await syncReminders('me');
    release({ ids: ['srv1'] });
    await pending;
    const rows = localReminders();
    expect(rows.map((r) => r.id)).toEqual(['srv1']);
    expect(rows[0].notification_id).toBe('n1');
  });

  it('an edit made with the old local id after the upload updates the same reminder', async () => {
    mockApi.insert.mockRejectedValueOnce(new Error('offline'));
    const local = await saveReminder({ ...base, due_at: new Date(Date.now() + 3600_000).toISOString() });
    mockApi.insert.mockResolvedValueOnce({ ids: ['srv9'] });
    await retryPendingRecords();
    await saveReminder({ ...base, id: local.id, note: 'Moved', due_at: new Date(Date.now() + 7200_000).toISOString() });
    const rows = localReminders();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'srv9', note: 'Moved' });
  });
});

describe('pruneDone', () => {
  const row = (id: string, p: Partial<Reminder>): Reminder => ({ ...base, id, due_at: '', done: false, done_at: '', synced: true, ...p });
  it('drops old finished reminders but keeps open, unsent and unconfirmed ones', () => {
    const now = Date.parse('2026-11-12T10:00:00Z');
    const old = new Date(now - 40 * 86400_000).toISOString();
    const rows = [
      row('open', {}),
      row('oldDone', { done: true, done_at: old }),
      row('oldDirty', { done: true, done_at: old, dirty: true }),
      row('oldUnsent', { done: true, done_at: old, synced: false }),
      row('recent', { done: true, done_at: new Date(now - 86400_000).toISOString() }),
    ];
    expect(pruneDone(rows, now).map((r) => r.id)).toEqual(['open', 'oldDirty', 'oldUnsent', 'recent']);
  });
});

describe('syncLeadFollowUp', () => {
  it('closing a reminder leaves a follow-up date that came from someone else', async () => {
    mockLead.current = { id: 'L1', nextFollowUp: new Date('2026-11-20T10:00:00Z') };
    const res = await syncLeadFollowUp('L1', { closedDue: ['2026-11-13T10:00:00Z'] });
    expect(res).toBeNull();
    expect(mockUpdateLead).not.toHaveBeenCalled();
  });

  it('closing the reminder the date came from clears it when none is left', async () => {
    mockLead.current = { id: 'L1', nextFollowUp: new Date('2026-11-13T10:00:00Z') };
    await syncLeadFollowUp('L1', { closedDue: ['2026-11-13T10:00:00Z'] });
    expect(mockUpdateLead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ nextFollowUp: null }));
  });

  it('a new reminder sets the earliest open call reminder, not the newest', async () => {
    mockApi.insert.mockRejectedValue(new Error('offline'));
    await saveReminder({ ...base, due_at: '2026-11-13T10:00:00.000Z' });
    await saveReminder({ ...base, due_at: '2026-11-20T10:00:00.000Z' });
    await syncLeadFollowUp('L1');
    expect(mockUpdateLead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ nextFollowUp: new Date('2026-11-13T10:00:00.000Z') }));
    mockApi.insert.mockReset();
  });
});
