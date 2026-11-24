/* eslint-disable import/first -- jest.mock is hoisted above these imports anyway */
import type { Contact } from '@ab-ecosystem/cpaas';

const mockApi = { get: jest.fn(), update: jest.fn(), delete: jest.fn(), list: jest.fn() };
jest.mock('@/services/crm/client', () => ({ crm: () => ({ contacts: mockApi }), crmFor: () => ({ contacts: mockApi }) }));

import { listLeadsByField, toCustomFieldPatch, toLead, trashLead, updateLead } from '@/services/crm/leads';
import { F } from '@/services/crm/schema';

const contact = (overrides: Partial<Contact> = {}): Contact =>
  ({
    id: 'c1',
    name: { salutation: '', first_name: 'Ada', last_name: 'Lovelace' },
    profile: {
      whatsapp: {
        id: 'p1',
        channel: 'whatsapp',
        identifier: '919876543210',
        name: 'Ada',
        profile_pic: '',
        extra: {},
      },
    },
    custom_field_hash: {
      [F.status]: 'Follow-Up',
      [F.nextFollowUp]: '2026-10-25T04:30:00.000Z',
    },
    chat_metadata: {
      new: false,
      archived: false,
      unread: 2,
      pause_duration: 0,
      marked_as_unread: false,
      closed: false,
      marked_as_done: false,
      blocked: { incoming: false, outgoing: false, bot: false, mockApi: false },
    },
    last_seen: 0,
    last_icm_timestamp: 0,
    last_interaction_props: {},
    agent: 'u9',
    team: null,
    lead_source: { type: 'import', id: null },
    status: 'live',
    privacy_status: 'open',
    tags: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    ...overrides,
  }) as Contact;

describe('toLead', () => {
  it('flattens a contact into a lead view', () => {
    const lead = toLead(contact());
    expect(lead.name).toBe('Ada Lovelace');
    expect(lead.phone).toBe('919876543210');
    expect(lead.status).toBe('Follow-Up');
    expect(lead.nextFollowUp?.toISOString()).toBe('2026-10-25T04:30:00.000Z');
    expect(lead.agentId).toBe('u9');
    expect(lead.unread).toBe(2);
  });

  it('falls back to the number when there is no name', () => {
    const lead = toLead(contact({ name: { salutation: '', first_name: '', last_name: '' } }));
    expect(lead.name).toBe('Ada'); // profile name wins over the number
    const bare = toLead(
      contact({
        name: { salutation: '', first_name: '', last_name: '' },
        profile: {
          whatsapp: {
            id: 'p',
            channel: 'whatsapp',
            identifier: '15550001',
            name: '',
            profile_pic: '',
            extra: {},
          },
        },
      }),
    );
    expect(bare.name).toBe('+15550001');
  });

  it('tolerates a contact with no channel identity', () => {
    const lead = toLead(contact({ profile: {} }));
    expect(lead.phone).toBe('');
    expect(lead.name).toBe('Ada Lovelace');
  });
});

describe('toCustomFieldPatch', () => {
  it('only writes keys that are present', () => {
    expect(toCustomFieldPatch({ status: 'Won' })).toEqual({
      [F.status]: 'Won',
    });
    const d = new Date('2026-11-01T10:00:00.000Z');
    expect(toCustomFieldPatch({ nextFollowUp: d, followUpNote: '' })).toEqual({
      [F.nextFollowUp]: d.toISOString(),
      [F.followUpNote]: '',
    });
  });
});

describe('writes', () => {
  beforeEach(() => Object.values(mockApi).forEach((f) => f.mockReset()));

  it('trashes with a status change, never a delete (a second delete is permanent)', async () => {
    mockApi.update.mockResolvedValue(contact({ status: 'trashed' }));
    await trashLead('c1');
    expect(mockApi.update).toHaveBeenCalledWith('c1', { status: 'trashed' });
    expect(mockApi.delete).not.toHaveBeenCalled();
  });

  it('applies tag additions / removals to the tags as stored now, not the cached copy', async () => {
    const stale = toLead(contact({ tags: [] }));
    mockApi.get.mockResolvedValue(contact({ tags: [{ id: 'a' }, { id: 'b' }] as never }));
    mockApi.update.mockImplementation(async (_id: string, body: object) => contact(body as never));
    await updateLead(stale, { addTags: ['c'], removeTags: ['a'] });
    expect(mockApi.update.mock.calls[0][1].tags).toEqual(['b', 'c']);
  });

  it('skips the write when nothing changes', async () => {
    const lead = toLead(contact({ tags: [{ id: 'a' }] as never }));
    mockApi.get.mockResolvedValue(contact({ tags: [{ id: 'a' }] as never }));
    await updateLead(lead, { addTags: ['a'] });
    expect(mockApi.update).not.toHaveBeenCalled();
  });

  it('puts contacts with no value in the "Not set" column, and in the default one', async () => {
    mockApi.list.mockResolvedValue({ data: [], pagination: { total: 0 } });
    await listLeadsByField('lead_x_stage', '');
    expect(mockApi.list.mock.calls[0][0].filter.conditions.map((c: { condition: string; operator: unknown }) => [c.operator, c.condition])).toEqual([
      [null, 'is empty'],
      ['or', 'does not exist'],
    ]);
    await listLeadsByField(F.status, 'New', 50, 'New');
    expect(mockApi.list.mock.calls[1][0].filter.conditions.map((c: { condition: string }) => c.condition)).toEqual(['equal to', 'is empty', 'does not exist']);
  });
});
