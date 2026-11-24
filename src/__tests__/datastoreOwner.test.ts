import { DEFAULT_APP_PERMISSIONS, P } from '@/lib/permissions';
import { ensureDataStore } from '@/services/crm/datastore';
import { canInAccount } from '@/services/crm/rolePermissions';

const mockState = { owner: true, perms: null as string[] | null, stores: [] as { id: string; title: string }[] };

jest.mock('@/services/storage', () => ({
  readJson: (key: string) => (key === 'appperms.mine.v1' ? mockState.perms : null),
  writeJson: () => undefined,
}));
jest.mock('@/stores/accounts', () => ({
  activeAccountId: () => 'acct',
  useAccountsStore: { getState: () => ({ activeId: 'acct', sessions: [{ id: 'acct', isOwner: mockState.owner }] }) },
}));
jest.mock('@/stores/features', () => ({
  featuresOf: () => ({ crm: true, followups: false, services: false, cloudSync: false }),
}));

const mockApi = {
  dataStores: {
    list: jest.fn(async () => ({ data: mockState.stores })),
    regions: jest.fn(async () => ({ data: [] })),
    plans: jest.fn(async () => ({
      plans: [{ id: 'test-datastore-plan', paid: true, cycles: ['30D', '365D'] }],
      metrics: [],
      allowance: { used: 0, capped: false },
    })),
    create: jest.fn(async (b: { title: string }) => ({ id: 'new', title: b.title })),
  },
  dataStoreCollections: {
    list: jest.fn(async () => ({ data: [], pagination: { pages: 1 } })),
    create: jest.fn(async (_s: string, b: { title: string }) => ({ id: `c-${b.title}` })),
    update: jest.fn(),
  },
};
jest.mock('@/services/crm/client', () => ({
  crmFor: () => mockApi,
  isPlanError: () => false,
  isFinalPlanError: () => false,
  describeCrmError: (e: unknown) => String(e),
}));

describe('data store: only the owner creates it', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.stores = [];
  });

  it('a team member never creates the store and is told the owner has to set it up', async () => {
    mockState.owner = false;
    const h = await ensureDataStore(true, 'acct');
    expect(h.available).toBe(false);
    expect(h.reason).toMatch(/owner/i);
    expect(mockApi.dataStores.create).not.toHaveBeenCalled();
    expect(mockApi.dataStoreCollections.create).not.toHaveBeenCalled();
  });

  it('a team member uses the existing store but adds no tables to it', async () => {
    mockState.owner = false;
    mockState.stores = [{ id: 'store', title: 'Test Followups' }];
    const h = await ensureDataStore(true, 'acct');
    expect(h.available).toBe(true);
    expect(h.storeId).toBe('store');
    expect(mockApi.dataStoreCollections.create).not.toHaveBeenCalled();
  });

  it('nothing is created automatically, not even for the owner', async () => {
    mockState.owner = true;
    const h = await ensureDataStore(true, 'acct');
    expect(h.available).toBe(false);
    expect(h.reason).toMatch(/not set up/i);
    expect(h.kind).toBe('setup');
    expect(mockApi.dataStores.create).not.toHaveBeenCalled();
    expect(mockApi.dataStoreCollections.create).not.toHaveBeenCalled();
  });

  it('the owner\'s workspace setup creates one store with every table inside it', async () => {
    mockState.owner = true;
    const h = await ensureDataStore(true, 'acct', { create: true, plan: { plan: 'picked-plan', duration: '30D' } });
    expect(mockApi.dataStores.create).toHaveBeenCalledTimes(1);
    // Created on the plan the owner picked in the workspace setup.
    expect(mockApi.dataStores.create).toHaveBeenCalledWith(expect.objectContaining({ plan: 'picked-plan', duration: '30D' }));
    expect(h.storeId).toBe('new');
    const titles = mockApi.dataStoreCollections.create.mock.calls.map((c) => c[1].title);
    expect(titles).toEqual(expect.arrayContaining(['Remarks', 'Reminders', 'Role permissions']));
    expect(mockApi.dataStoreCollections.create.mock.calls.every((c) => c[0] === 'new')).toBe(true);
  });
});

describe('app permissions outside React', () => {
  it('owners may do everything', () => {
    mockState.owner = true;
    expect(canInAccount('acct', P.app.workspaceSettings)).toBe(true);
  });

  it('a member without a saved set gets the defaults: day-to-day work, no workspace settings', () => {
    mockState.owner = false;
    mockState.perms = null;
    expect(DEFAULT_APP_PERMISSIONS.every((k) => canInAccount('acct', k))).toBe(true);
    expect(canInAccount('acct', P.app.workspaceSettings)).toBe(false);
  });

  it('a member goes by their role’s saved set', () => {
    mockState.owner = false;
    mockState.perms = [P.app.workspaceSettings];
    expect(canInAccount('acct', P.app.workspaceSettings)).toBe(true);
    expect(canInAccount('acct', P.app.series)).toBe(false);
  });
});
