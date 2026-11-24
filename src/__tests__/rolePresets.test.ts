import type { PermissionCatalogue } from '@ab-ecosystem/sso';

import { presetExists, resolvePreset, ROLE_PRESETS } from '@/services/sso/rolePresets';

const feature = (key: string, verbs: string[], implies: Record<string, string[]> = {}) => ({
  key,
  label: key,
  entitled: true,
  scopable: false,
  inclusion: null,
  actions: verbs.map((v) => ({ key: `${key}.${v}`, verb: v, label: v, implies: implies[v] ?? [] })),
});

const catalogue: PermissionCatalogue = {
  catalogue_version: '1',
  enforced: true,
  verbs: [],
  entitlement: [],
  groups: [
    {
      name: 'CRM',
      features: [
        feature('CRM.CONTACT', ['LIST', 'READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT']),
        feature('CRM.CHAT', ['LIST', 'READ', 'SEND', 'UPDATE', 'TRANSFER', 'DELETE'], { TRANSFER: ['TEAM.LIST'] }),
        feature('CRM.DATASTORE.RECORD', ['LIST', 'READ', 'CREATE', 'UPDATE', 'DELETE']),
      ],
    },
    { name: 'Team', features: [feature('TEAM', ['LIST'])] },
  ],
};

const preset = (id: string) => ROLE_PRESETS.find((p) => p.id === id)!;

describe('role presets', () => {
  it('only uses actions the catalogue has', () => {
    const keys = resolvePreset(catalogue, preset('followup'));
    expect(keys.sort()).toEqual(
      [
        'CRM.CHAT.LIST',
        'CRM.CHAT.READ',
        'CRM.CHAT.SEND',
        'CRM.CONTACT.LIST',
        'CRM.CONTACT.READ',
        'CRM.CONTACT.UPDATE',
        'CRM.DATASTORE.RECORD.CREATE',
        'CRM.DATASTORE.RECORD.LIST',
        'CRM.DATASTORE.RECORD.READ',
        'CRM.DATASTORE.RECORD.UPDATE',
        'TEAM.LIST',
      ].sort(),
    );
  });

  it('gives the partial admin everything except delete', () => {
    const keys = resolvePreset(catalogue, preset('partialAdmin'));
    expect(keys.some((k) => k.endsWith('.DELETE'))).toBe(false);
    expect(keys).toEqual(expect.arrayContaining(['CRM.CONTACT.CREATE', 'CRM.CONTACT.EXPORT', 'CRM.CHAT.TRANSFER']));
  });

  it('pulls in what an action implies', () => {
    expect(resolvePreset(catalogue, preset('support'))).toContain('TEAM.LIST');
  });

  it('treats a role with the same name, in any case, as already added', () => {
    expect(presetExists([{ id: 'r1', title: ' follow-up agent ', permission: [] }], preset('followup'))).toBe(true);
    expect(presetExists([{ id: 'r1', title: 'Follow-up agent 2', permission: [] }], preset('followup'))).toBe(false);
  });
});
