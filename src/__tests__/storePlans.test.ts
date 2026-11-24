import type { DataStorePlanCatalogue } from '@ab-ecosystem/cpaas';

import { normaliseTenure, restrictToTenure } from '@/services/crm/storePlans';

jest.mock('@/services/sso/client', () => ({ getSubscriptionTenure: jest.fn() }));
jest.mock('@/stores/accounts', () => ({ activeAccountId: () => 'acct', tokenFor: () => 't' }));
jest.mock('@/services/crm/datastore', () => ({ listDataStorePlans: jest.fn() }));

const catalogue = {
  plans: [
    { id: 'free', paid: false, cycles: ['LTD'], pricing: {} },
    { id: 'pro', paid: true, cycles: ['30D', '360D'], pricing: { '30D': 10, '360D': 100 } },
    { id: 'max', paid: true, cycles: ['360D'], pricing: { '360D': 300 } },
  ],
  metrics: [],
  allowance: { used: 0, capped: false },
} as unknown as DataStorePlanCatalogue;

describe('data store plans by main plan tenure', () => {
  it.each(['30D', '90D', '180D', '360D'])('%s main plan: every paid plan offers only that tenure, at its price', (tenure) => {
    const all = {
      ...catalogue,
      plans: [
        { id: 'std', paid: true, cycles: ['30D', '90D', '180D', '360D'], pricing: { '30D': 1, '90D': 3, '180D': 6, '360D': 12 } },
        { id: 'big', paid: true, cycles: ['90D', '360D'], pricing: { '90D': 9, '360D': 36 } },
      ],
    } as unknown as DataStorePlanCatalogue;
    const r = restrictToTenure(all, tenure.toLowerCase());
    expect(r.tenure).toBe(tenure);
    for (const p of r.plans) {
      expect(p.cycles).toEqual([tenure]);
      expect(Object.keys(p.pricing)).toEqual([tenure]);
    }
    expect(r.plans.map((p) => p.id)).toEqual(tenure === '90D' || tenure === '360D' ? ['std', 'big'] : ['std']);
  });

  it('normalises cycle spellings', () => {
    expect(normaliseTenure('30D')).toBe('30D');
    expect(normaliseTenure(' 30 days ')).toBe('30D');
    expect(normaliseTenure('360')).toBe('360D');
    expect(normaliseTenure('lifetime')).toBe('LTD');
  });

  it('30-day main plan: only 30-day cycles, plans without one dropped', () => {
    const r = restrictToTenure(catalogue, '30D');
    expect(r.plans.map((p) => p.id)).toEqual(['free', 'pro']);
    expect(r.plans[1].cycles).toEqual(['30D']);
    expect(r.plans[1].pricing).toEqual({ '30D': 10 });
    expect(r.noMatch).toBe(false);
  });

  it('360-day main plan: only 360-day cycles', () => {
    const r = restrictToTenure(catalogue, '360D');
    expect(r.plans.map((p) => [p.id, p.cycles])).toEqual([
      ['free', ['LTD']],
      ['pro', ['360D']],
      ['max', ['360D']],
    ]);
  });

  it('no plan for the tenure: nothing to pick, creation blocked', () => {
    const paidOnly = { ...catalogue, plans: catalogue.plans.filter((p) => p.paid) };
    const r = restrictToTenure(paidOnly, '90D');
    expect(r.plans).toEqual([]);
    expect(r.noMatch).toBe(true);
  });

  it('subscription names no tenure: paid plans hidden', () => {
    const paidOnly = { ...catalogue, plans: catalogue.plans.filter((p) => p.paid) };
    expect(restrictToTenure(paidOnly, null).noMatch).toBe(true);
  });
});
