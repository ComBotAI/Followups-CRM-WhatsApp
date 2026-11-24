/**
 * Development only: sample data for the data store step of Workspace setup in web preview mode,
 * so the plan picker and tenure can be laid out without a server.
 *
 *   /workspace-setup?preview=1&setup=1              90-day subscription plan
 *   /workspace-setup?preview=1&setup=1&tenure=360   360-day subscription plan
 *
 * Compiled out of production builds (isWebPreview is false there).
 */
import type { DataStorePlanCatalogue } from '@ab-ecosystem/cpaas';

import { restrictToTenure, type TenuredPlanCatalogue } from '@/services/crm/storePlans';
import { isWebPreview } from './webPreview';

export type PreviewSetup = { tenure: string };

export const previewSetup = (): PreviewSetup | null => {
  if (!isWebPreview()) return null;
  const q = new URLSearchParams(window.location.search);
  const setup = q.get('setup');
  if (!setup) return null;
  return { tenure: `${Number(q.get('tenure')) || 90}D` };
};

const MB = 1024 * 1024;

/** The full CPaaS catalogue: plans sold on several tenures, as the backend may offer them. */
const catalogue = {
  plans: [
    {
      id: 'starter',
      name: 'Starter',
      caption: 'For trying it out',
      paid: false,
      default: false,
      cycles: ['LTD'],
      pricing: {},
      storageBytes: 50 * MB,
      rateLimit: 5,
    },
    {
      id: 'standard',
      name: 'Standard',
      caption: 'Most small teams',
      paid: true,
      default: true,
      cycles: ['30D', '90D', '180D', '360D'],
      currency: 'INR',
      pricing: { '30D': 199, '90D': 549, '180D': 999, '360D': 1799 },
      storageBytes: 1024 * MB,
      rateLimit: 20,
    },
    {
      id: 'pro',
      name: 'Pro',
      caption: 'Large lead lists and campaigns',
      paid: true,
      default: false,
      cycles: ['90D', '360D'],
      currency: 'INR',
      pricing: { '90D': 1499, '360D': 4999 },
      storageBytes: 10 * 1024 * MB,
      rateLimit: 50,
    },
  ],
  metrics: [],
  allowance: { used: 0, capped: true, limit: 1 },
} as unknown as DataStorePlanCatalogue;

export const previewCatalogue = (p: PreviewSetup): TenuredPlanCatalogue => restrictToTenure(catalogue, p.tenure);
