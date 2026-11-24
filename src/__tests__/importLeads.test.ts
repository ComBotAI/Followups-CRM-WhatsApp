/* eslint-disable import/first -- jest.mock is hoisted above these imports anyway */
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('@/services/crm/leads', () => ({ createLead: jest.fn() }));

import { CrmApiError } from '@/services/crm/client';
import { importRows } from '@/services/crm/importLeads';
import { createLead } from '@/services/crm/leads';

const create = createLead as jest.Mock;

describe('importRows', () => {
  beforeEach(() => create.mockReset());

  it('sends each number once, counts repeats and 409s as duplicates, and keeps the round robin even', async () => {
    create.mockImplementation(async (input: { phone: string }) => {
      if (input.phone === '+919876500002') throw new CrmApiError(409, 'conflict', 'exists');
      return {};
    });
    const rows = ['9876500001', '9876500002', '9876500001', '9876500003', 'x'].map((phone) => ({ Phone: phone, Name: 'A B' }));
    let i = 0;
    const team = [
      { userId: 'u1', name: 'One' },
      { userId: 'u2', name: 'Two' },
    ];
    const summary = await importRows({ headers: ['Phone', 'Name'], rows, fileName: 'f.csv' }, { phone: 'Phone', name: 'Name' }, { assignNext: () => team[i++ % 2] }, undefined, 1);
    expect(summary).toMatchObject({ total: 5, created: 2, duplicate: 2, invalid: 1, failed: 0 });
    expect(create.mock.calls.map((c) => c[0].phone)).toEqual(['+919876500001', '+919876500002', '+919876500003']);
    // The assignee of the row that turned out to exist went to the next row.
    expect(create.mock.calls.map((c) => c[0].agentId)).toEqual(['u1', 'u2', 'u2']);
  });
});
