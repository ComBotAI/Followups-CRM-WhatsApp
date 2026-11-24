import { parseDay, showDay } from '@/lib/day';
import { parseAmount } from '@/lib/money';
import { dayOf } from '@/services/crm/leads';
import { nextOccasionStart, recount, type ServiceVisit } from '@/services/crm/services';
import { homeTabFor } from '@/stores/features';
import { INDUSTRIES } from '@/services/visits/industries';
import { tierFor } from '@/stores/visits';

describe('parseDay / showDay', () => {
  it('reads the usual ways people type a date', () => {
    expect(parseDay('24/08/1992')).toBe('1992-08-24');
    expect(parseDay('4-8-1992')).toBe('1992-08-04');
    expect(parseDay('24.08.1992')).toBe('1992-08-24');
    expect(parseDay('1992-08-24')).toBe('1992-08-24');
  });
  it('refuses dates that do not exist', () => {
    expect(parseDay('31/02/2020')).toBe('');
    expect(parseDay('13/13/2020')).toBe('');
    expect(parseDay('tomorrow')).toBe('');
  });
  it('shows a stored date as DD/MM/YYYY', () => {
    expect(showDay('1992-08-24')).toBe('24/08/1992');
    expect(showDay('')).toBe('');
  });
  it('keeps a date field a date, whatever shape it comes back in', () => {
    expect(dayOf('1992-08-24')).toBe('1992-08-24');
    expect(dayOf('1992-08-24T00:00:00.000Z')).toBe('1992-08-24');
    expect(dayOf('')).toBe('');
  });
});

describe('nextOccasionStart', () => {
  const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h, 0, 0, 0);

  it('is this year when the date is still ahead, at 10:00', () => {
    const s = nextOccasionStart('1990-08-24', 0, at(2026, 3, 1))!;
    expect([s.getFullYear(), s.getMonth() + 1, s.getDate(), s.getHours()]).toEqual([2026, 8, 24, 10]);
  });
  it('rolls to next year once the date has passed', () => {
    const s = nextOccasionStart('1990-03-10', 0, at(2026, 6, 1))!;
    expect([s.getFullYear(), s.getMonth() + 1, s.getDate()]).toEqual([2027, 3, 10]);
  });
  it('starts days early, across a month boundary', () => {
    const s = nextOccasionStart('1990-03-02', 5, at(2026, 1, 15))!;
    expect([s.getFullYear(), s.getMonth() + 1, s.getDate()]).toEqual([2026, 2, 25]);
  });
  it('uses 28 Feb for a 29 Feb birthday in other years', () => {
    const s = nextOccasionStart('2000-02-29', 0, at(2026, 1, 1))!;
    expect([s.getMonth() + 1, s.getDate()]).toEqual([2, 28]);
  });
  it('on the day itself, before 10:00, is still today', () => {
    const s = nextOccasionStart('1990-08-24', 0, at(2026, 8, 24, 8))!;
    expect([s.getFullYear(), s.getMonth() + 1, s.getDate()]).toEqual([2026, 8, 24]);
  });
  it('gives nothing without a date', () => {
    expect(nextOccasionStart('', 0)).toBeNull();
  });
  it('finds the next one when "days before" crosses New Year', () => {
    // 2 Jan birthday, 7 days early, on 30 Dec: this one started on 26 Dec, the next starts 26 Dec next year.
    const s = nextOccasionStart('1990-01-02', 7, at(2026, 12, 30))!;
    expect([s.getFullYear(), s.getMonth() + 1, s.getDate()]).toEqual([2027, 12, 26]);
  });
});

describe('tierFor', () => {
  it('goes New → Regular → VIP by visits', () => {
    const c = { regularAt: 3, vipAt: 10 };
    expect(tierFor(1, c)).toBe('New');
    expect(tierFor(3, c)).toBe('Regular');
    expect(tierFor(10, c)).toBe('VIP');
  });
});

describe('industry templates', () => {
  it('have unique keys, services and rules', () => {
    expect(new Set(INDUSTRIES.map((i) => i.key)).size).toBe(INDUSTRIES.length);
    for (const i of INDUSTRIES) {
      expect(i.services.length).toBeGreaterThan(0);
      expect(new Set(i.services.map((s) => s.key)).size).toBe(i.services.length);
      expect(new Set(i.rules.map((r) => r.key)).size).toBe(i.rules.length);
      for (const r of i.rules) expect(r.steps.every((s) => s.text.trim().length > 0)).toBe(true);
    }
  });
  it('only use message tokens the app can fill', () => {
    const known = /^(first_name|name|business|review_link|visit_count|service|lead_x_[a-z0-9_]+)$/;
    for (const i of INDUSTRIES) {
      const texts = [...i.rules.flatMap((r) => r.steps.map((s) => s.text)), i.recall ?? ''];
      for (const text of texts) for (const m of text.matchAll(/\[\[\s*([a-zA-Z0-9_]+)\s*\]\]/g)) expect(m[1]).toMatch(known);
    }
  });
});

describe('parseAmount', () => {
  it('reads amounts in any common format', () => {
    expect(parseAmount('650')).toBe(650);
    expect(parseAmount('₹ 1,250')).toBe(1250);
    expect(parseAmount('1,250.50')).toBe(1250.5);
    expect(parseAmount('1.250,50')).toBe(1250.5);
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('parseAmount: float noise', () => {
  it('reads a computed sum as a decimal, rounded to cents (not as thousands)', () => {
    expect(parseAmount(String(10.1 + 20.2))).toBe(30.3);
    expect(parseAmount(String(0.1 + 0.2))).toBe(0.3);
    expect(parseAmount('1.250')).toBe(1250);
  });
});

describe('dates without a year', () => {
  it('stores DD/MM with the placeholder year and shows it back without one', () => {
    expect(parseDay('24/08')).toBe('1904-08-24');
    expect(parseDay('29/02')).toBe('1904-02-29');
    expect(parseDay('31/02')).toBe('');
    expect(showDay('1904-08-24')).toBe('24/08');
  });
  it('uses only the day and month for occasions', () => {
    const s = nextOccasionStart('1904-08-24', 0, new Date(2026, 2, 1))!;
    expect([s.getFullYear(), s.getMonth() + 1, s.getDate()]).toEqual([2026, 8, 24]);
  });
});

describe('nextOccasionStart: late', () => {
  it('starts in a minute when the date is still ahead but its start has passed', () => {
    const now = new Date(2026, 7, 20, 12);
    const s = nextOccasionStart('1990-08-24', 7, now, true)!;
    expect(s.getTime() - now.getTime()).toBe(60_000);
    // Without `late`, next year's.
    expect(nextOccasionStart('1990-08-24', 7, now)!.getFullYear()).toBe(2027);
  });
  it('on the day after 10:00 is still today', () => {
    const now = new Date(2026, 7, 24, 15);
    expect(nextOccasionStart('1990-08-24', 0, now, true)!.getTime() - now.getTime()).toBe(60_000);
  });
});

describe('recount', () => {
  const v = (id: string, day: number, price: number | null): ServiceVisit => ({
    id,
    contactId: 'c',
    contactName: '',
    serviceIds: [],
    serviceNames: [],
    visitedAt: new Date(2026, 0, day).toISOString(),
    price,
    memberId: '',
    memberName: '',
    note: '',
    partySize: null,
    returning: false,
  });
  it('counts from the records, so a visit added at the same time on another phone is not lost', () => {
    // The contact still says 1 visit; two new ones landed meanwhile.
    const lead = { visitCount: 1, totalSpent: 100, firstVisit: new Date(2026, 0, 1), lastVisit: new Date(2026, 0, 1) };
    const s = recount(lead, [v('a', 1, 100), v('b', 2, 50), v('c', 3, 25)], { added: v('c', 3, 25) });
    expect(s.count).toBe(3);
    expect(s.spent).toBe(175);
    expect(s.last!.getDate()).toBe(3);
  });
  it('keeps history counted before any records (imports)', () => {
    const lead = { visitCount: 10, totalSpent: 1000, firstVisit: new Date(2025, 0, 1), lastVisit: new Date(2025, 5, 1) };
    const s = recount(lead, [v('a', 5, 200)], { added: v('a', 5, 200) });
    expect(s.count).toBe(11);
    expect(s.spent).toBe(1200);
    expect(s.first!.getFullYear()).toBe(2025);
  });
  it('puts the profile right after a visit is deleted', () => {
    const lead = { visitCount: 2, totalSpent: 150, firstVisit: new Date(2026, 0, 1), lastVisit: new Date(2026, 0, 2) };
    const s = recount(lead, [v('a', 1, 100)], { removed: v('b', 2, 50) });
    expect(s.count).toBe(1);
    expect(s.spent).toBe(100);
    expect(s.last!.getDate()).toBe(1);
  });
  it('empties the profile when the only visit is deleted', () => {
    const lead = { visitCount: 1, totalSpent: 50, firstVisit: new Date(2026, 0, 2), lastVisit: new Date(2026, 0, 2) };
    const s = recount(lead, [], { removed: v('b', 2, 50) });
    expect([s.count, s.spent, s.first, s.last]).toEqual([0, 0, null, null]);
  });
});

describe('homeTabFor', () => {
  const all = { crm: true, followups: true, services: true, cloudSync: true };
  it('opens on Visits for those who can see contacts', () => {
    expect(homeTabFor(all, true)).toBe('visits');
  });
  it('never lands a member on a page their role cannot open', () => {
    expect(homeTabFor(all, true, { contacts: false })).toBe('more');
  });
});
