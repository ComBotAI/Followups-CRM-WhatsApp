import { CrmApiError } from '@ab-ecosystem/cpaas';

import { ensureLeadSchema, LEAD_FIELDS } from '@/services/crm/schema';

const mockCreate = jest.fn();
jest.mock('@/services/crm/client', () => {
  const actual = jest.requireActual('@/services/crm/client');
  return {
    ...actual,
    crm: () => ({}),
    crmFor: () => ({
      customFields: {
        list: async () => ({ data: [], pagination: { pages: 1 } }),
        create: (spec: { slug: string }) => mockCreate(spec),
      },
    }),
  };
});

const quota = (used: number, limit: number) =>
  Object.assign(Object.create(CrmApiError.prototype), {
    message: 'quota',
    status: 402,
    code: 'quota_exceeded',
    details: { resource: 'custom_fields', used, limit },
  });

beforeEach(() => {
  jest.useFakeTimers();
  mockCreate.mockReset();
});
afterEach(() => jest.useRealTimers());

const run = async () => {
  const p = ensureLeadSchema('acct');
  for (let i = 0; i < 200; i += 1) {
    await jest.advanceTimersByTimeAsync(5000);
  }
  return p;
};

it('retries a 402 that comes and goes, and creates every field in one go', async () => {
  let n = 0;
  // Every other call is refused, the way CPaaS answered on a plan with room.
  mockCreate.mockImplementation(async (spec: { slug: string }) => {
    n += 1;
    if (n % 2 === 0) throw quota(n, 50);
    return { slug: spec.slug };
  });
  const { report } = await run();
  expect(report.created).toHaveLength(LEAD_FIELDS.length);
  expect(report.planLimited).toBe(false);
});

it('stops at once on a real limit', async () => {
  mockCreate.mockImplementationOnce(async (spec: { slug: string }) => ({ slug: spec.slug })).mockRejectedValue(quota(50, 50));
  const { report } = await run();
  expect(report.created).toHaveLength(1);
  expect(report.planLimited).toBe(true);
  // One refused create, then the rest skipped without calling the server.
  expect(mockCreate).toHaveBeenCalledTimes(2);
});
