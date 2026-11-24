import { bucketsOf, change, comparableRange, rangeOf, summarize, type ReportVisit } from '@/lib/reports';

// Wednesday 12 Nov 2026, 15:00 local.
const NOW = new Date(2026, 10, 12, 15, 0);
const at = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();
const visit = (p: Partial<ReportVisit>): ReportVisit => ({ contactId: 'c1', serviceNames: [], visitedAt: at(12), price: null, memberName: '', returning: false, ...p });

describe('rangeOf', () => {
  it('day, week from Monday, calendar month', () => {
    expect(rangeOf('day', 0, NOW)).toEqual({ from: new Date(2026, 10, 12), to: new Date(2026, 10, 13) });
    expect(rangeOf('day', -1, NOW).from).toEqual(new Date(2026, 10, 11));
    expect(rangeOf('week', 0, NOW)).toEqual({ from: new Date(2026, 10, 9), to: new Date(2026, 10, 16) });
    expect(rangeOf('week', -1, NOW).from).toEqual(new Date(2026, 10, 2));
    expect(rangeOf('month', 0, NOW)).toEqual({ from: new Date(2026, 10, 1), to: new Date(2026, 11, 1) });
    expect(rangeOf('month', -11, NOW).from).toEqual(new Date(2025, 11, 1));
  });

  it('a Sunday belongs to the week that started the Monday before', () => {
    expect(rangeOf('week', 0, new Date(2026, 10, 15, 9)).from).toEqual(new Date(2026, 10, 9));
  });

  it('buckets: 24 hours, 7 days, days of the month', () => {
    expect(bucketsOf('day', rangeOf('day', 0, NOW))).toHaveLength(24);
    expect(bucketsOf('week', rangeOf('week', 0, NOW))).toHaveLength(7);
    expect(bucketsOf('month', rangeOf('month', 0, NOW))).toHaveLength(30);
    expect(bucketsOf('month', rangeOf('month', -9, NOW))).toHaveLength(28); // Feb 2026
  });
});

describe('summarize', () => {
  const week = rangeOf('week', 0, NOW);
  const before = rangeOf('week', -1, NOW);

  it('splits revenue by new and returning guests and compares with the week before', () => {
    const r = summarize(
      'week',
      week,
      before,
      [
        visit({ contactId: 'a', price: 500, visitedAt: at(10), serviceNames: ['Haircut', 'Shave'], memberName: 'Ravi' }),
        visit({ contactId: 'b', price: 300, visitedAt: at(11), returning: true, serviceNames: ['Haircut'], memberName: 'Ravi' }),
        visit({ contactId: 'b', price: null, visitedAt: at(12), returning: true }),
        visit({ contactId: 'z', price: 1000, visitedAt: at(4) }), // the week before
      ],
      [],
    );
    expect(r).toMatchObject({ revenue: 800, newRevenue: 500, returningRevenue: 300, visits: 3, newVisits: 1, returningVisits: 2, guests: 2 });
    expect(r.average).toBeCloseTo(266.67);
    expect(r.previous).toEqual({ revenue: 1000, visits: 1 });
    expect(r.services).toEqual([
      { key: 'Haircut', name: 'Haircut', visits: 2, revenue: 550 },
      { key: 'Shave', name: 'Shave', visits: 1, revenue: 250 },
    ]);
    expect(r.team).toEqual([{ key: 'Ravi', name: 'Ravi', visits: 2, revenue: 800 }]);
    expect(r.buckets.map((b) => b.visits)).toEqual([0, 1, 1, 1, 0, 0, 0]);
    expect(r.buckets[1]).toMatchObject({ newRevenue: 500, returningRevenue: 0 });
  });

  it('counts a visit as brought back only after a reminder sent since their visit before, within 30 days', () => {
    const r = summarize(
      'week',
      week,
      before,
      [
        visit({ contactId: 'a', visitedAt: at(3), returning: true }),
        visit({ contactId: 'a', visitedAt: at(10), returning: true, price: 400 }), // reminder on the 6th: yes
        visit({ contactId: 'b', visitedAt: at(5), returning: true }),
        visit({ contactId: 'b', visitedAt: at(11), returning: true, price: 200 }), // reminder before their last visit: no
        visit({ contactId: 'c', visitedAt: at(12), returning: true, price: 100 }), // reminder 40 days ago: no
      ],
      [
        { contactId: 'a', at: at(6) },
        { contactId: 'b', at: at(4) },
        { contactId: 'c', at: new Date(2026, 9, 3).toISOString() },
        { contactId: 'd', at: at(11) },
      ],
    );
    expect(r.broughtBack).toBe(1);
    expect(r.broughtBackRevenue).toBe(400);
    expect(r.remindersSent).toBe(1); // only the one inside this week
  });
});

describe('team', () => {
  it('credits each visit to who served it, one row per member even after a rename', () => {
    const r = summarize('week', rangeOf('week', 0, NOW), rangeOf('week', -1, NOW), [
      visit({ visitedAt: at(12), price: 300, memberId: 'u1', memberName: 'Ravi K' }),
      visit({ visitedAt: at(11), price: 200, memberId: 'u1', memberName: 'Ravi' }),
      visit({ visitedAt: at(10), price: 900, memberId: 'u2', memberName: 'Asha' }),
    ], []);
    expect(r.team).toEqual([
      { key: 'u2', name: 'Asha', visits: 1, revenue: 900 },
      { key: 'u1', name: 'Ravi K', visits: 2, revenue: 500 },
    ]);
  });
});

describe('brought back, with the visit before outside the period', () => {
  it('a reminder sent before their last visit (in an earlier week) does not count', () => {
    const day = rangeOf('day', 0, NOW);
    const r = summarize('day', day, rangeOf('day', -1, NOW), [
      visit({ contactId: 'a', visitedAt: at(12), returning: true, price: 100 }),
      visit({ contactId: 'a', visitedAt: at(2), returning: true }), // 10 days ago: loaded because reports reach back 30 days
    ], [{ contactId: 'a', at: at(1) }]);
    expect(r.broughtBack).toBe(0);
  });
});

describe('brought back is about returning guests', () => {
  it('a first visit after a lead follow-up is a new guest, not brought back', () => {
    const r = summarize('week', rangeOf('week', 0, NOW), rangeOf('week', -1, NOW), [visit({ contactId: 'n', visitedAt: at(11), returning: false, price: 500 })], [
      { contactId: 'n', at: at(9) },
    ]);
    expect(r.broughtBack).toBe(0);
  });
});

describe('comparableRange', () => {
  it('compares a period under way with the same stretch of the one before', () => {
    const month = rangeOf('month', 0, NOW);
    const prev = rangeOf('month', -1, NOW);
    const cmp = comparableRange(month, prev, NOW);
    expect(cmp.from).toEqual(prev.from);
    expect(cmp.to.getTime() - cmp.from.getTime()).toBe(NOW.getTime() - month.from.getTime());
    // A finished period is compared with all of the one before.
    expect(comparableRange(prev, rangeOf('month', -2, NOW), NOW)).toEqual(rangeOf('month', -2, NOW));
  });
});

describe('change', () => {
  it('percent from the period before, or null with nothing before', () => {
    expect(change(150, 100)).toBe(50);
    expect(change(50, 100)).toBe(-50);
    expect(change(10, 0)).toBeNull();
  });
});
