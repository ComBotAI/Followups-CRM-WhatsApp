import { buildContactFilter, countActiveFilters, toRuns } from '@/lib/filters';
import { F } from '@/services/crm/schema';

describe('buildContactFilter', () => {
  it('returns an empty condition list for no picks', () => {
    const { filter, collapsed } = buildContactFilter({});
    expect(filter.conditions).toEqual([]);
    expect(collapsed).toEqual([]);
  });

  it('ands single-valued picks with a null head operator', () => {
    const { filter } = buildContactFilter({
      statuses: ['Contacted'],
      contactTypes: ['Customers'],
    });
    expect(filter.conditions).toEqual([
      {
        operator: null,
        field_id: F.contactType,
        field_type: 'dropdown',
        condition: 'equal to',
        value: 'Customers',
      },
      {
        operator: 'and',
        field_id: F.status,
        field_type: 'dropdown',
        condition: 'equal to',
        value: 'Contacted',
      },
    ]);
  });

  it('takes contacts with no status (or no type) as New (or Leads): empty or never written', () => {
    const { filter } = buildContactFilter({ statuses: ['New'] });
    expect(toRuns(filter.conditions).map((r) => r.map((c) => c.condition))).toEqual([['equal to'], ['is empty'], ['does not exist']]);
    const types = buildContactFilter({ contactTypes: ['Leads'] }).filter;
    expect(toRuns(types.conditions).map((r) => r[0].condition)).toEqual(['equal to', 'is empty', 'does not exist']);
  });

  it('distributes a multi-valued pick so every other condition still applies', () => {
    const { filter } = buildContactFilter({
      tags: ['t1'],
      statuses: ['Interested', 'Contacted'],
    });
    expect(toRuns(filter.conditions).map((r) => r.map((c) => c.value))).toEqual([
      [['t1'], 'Interested'],
      [['t1'], 'Contacted'],
    ]);
  });

  it('keeps every value of two multi-valued fields', () => {
    const { filter, collapsed } = buildContactFilter({
      statuses: ['Won', 'Contacted'],
      contactTypes: ['Customers', 'VIP'],
    });
    expect(collapsed).toEqual([]);
    expect(toRuns(filter.conditions).map((r) => r.map((c) => c.value))).toEqual([
      ['Customers', 'Won'],
      ['Customers', 'Contacted'],
      ['VIP', 'Won'],
      ['VIP', 'Contacted'],
    ]);
  });

  it('narrows a field only when the expansion would pass the condition limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const { filter, collapsed } = buildContactFilter({ contactTypes: many, statuses: ['New', 'Contacted'] });
    expect(collapsed).toEqual([F.contactType]);
    expect(filter.conditions!.length).toBeLessThanOrEqual(50);
  });

  it('expresses tags as "has any of" and due today as a TODAY window', () => {
    const { filter } = buildContactFilter({ tags: ['a', 'b'], due: 'today' });
    expect(filter.conditions![0]).toMatchObject({
      field_id: 'tags',
      condition: 'equal to',
      value: ['a', 'b'],
    });
    expect(filter.conditions![1]).toMatchObject({
      field_id: F.nextFollowUp,
      condition: 'within',
      direction: 'TODAY',
    });
  });

  it('counts active filters', () => {
    expect(countActiveFilters({})).toBe(0);
    expect(
      countActiveFilters({
        tags: ['x'],
        due: 'today',
        createdWithinDays: 7,
        search: 'ignored',
      }),
    ).toBe(3);
  });
});

describe('andFilters', () => {
  const { andFilters, toRuns } = jest.requireActual('@/lib/filters') as typeof import('@/lib/filters');
  const c = (id: string, operator: 'and' | 'or' | null = 'and') => ({
    operator,
    field_id: id,
    field_type: 'text' as const,
    condition: 'equal to' as const,
    value: id,
  });

  it('distributes so (A or B) and C keeps its meaning without parentheses', () => {
    const seg = { conditions: [c('A', null), c('B', 'or')] };
    const extra = { conditions: [c('C', null)] };
    const out = andFilters(seg, extra);
    expect(toRuns(out.conditions).map((r) => r.map((x) => x.field_id))).toEqual([
      ['A', 'C'],
      ['B', 'C'],
    ]);
    expect(out.conditions?.map((x) => x.operator)).toEqual([null, 'and', 'or', 'and']);
  });

  it('returns the other side when one is empty', () => {
    expect(andFilters(undefined, { conditions: [c('X', null)] }).conditions?.map((x) => x.field_id)).toEqual(['X']);
  });
});

describe('leadMatches (WhatsApp task conditions)', () => {
  const { leadMatches } = jest.requireActual('@/lib/filters') as typeof import('@/lib/filters');
  const lead = {
    status: 'Contacted',
    tags: [{ id: 't1' }],
    agentId: 'u1',
    nextFollowUp: null,
    createdAt: new Date(),
  };
  it('matches when every chosen condition holds', () => {
    expect(leadMatches(lead, { statuses: ['New', 'Contacted'], tags: ['t1', 't9'] })).toBe(true);
    expect(leadMatches(lead, {})).toBe(true);
  });
  it('stops when the lead moved on (e.g. no longer New)', () => {
    expect(leadMatches(lead, { statuses: ['New'] })).toBe(false);
    expect(leadMatches(lead, { agent: 'unassigned' })).toBe(false);
  });
  it('treats a contact with no status as New', () => {
    expect(leadMatches({ ...lead, status: '' }, { statuses: ['New'] })).toBe(true);
  });
});
