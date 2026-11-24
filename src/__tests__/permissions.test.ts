import type { PermissionCatalogue } from '@ab-ecosystem/sso';

import { expandPermissions, minimalPermissions } from '@/services/sso/client';

const action = (key: string, implies: string[] = []) => ({ key, verb: key.split('.').pop()!, label: key, implies });

const catalogue: PermissionCatalogue = {
  catalogue_version: '1',
  enforced: true,
  verbs: [],
  entitlement: [],
  groups: [
    {
      name: 'CRM',
      features: [
        {
          key: 'CRM.CHAT',
          label: 'Chat',
          entitled: true,
          scopable: true,
          inclusion: null,
          actions: [action('CRM.CHAT.LIST'), action('CRM.CHAT.TRANSFER', ['CRM.CHAT.LIST', 'TEAM.LIST'])],
        },
        { key: 'TEAM', label: 'Team', entitled: true, scopable: false, inclusion: null, actions: [action('TEAM.LIST', ['TEAM.VIEW']), action('TEAM.VIEW')] },
      ],
    },
  ],
};

describe('role permissions', () => {
  it('expands implies transitively and keeps unknown keys', () => {
    expect(expandPermissions(catalogue, ['CRM.CHAT.TRANSFER', 'X.Y']).sort()).toEqual(['CRM.CHAT.LIST', 'CRM.CHAT.TRANSFER', 'TEAM.LIST', 'TEAM.VIEW', 'X.Y']);
  });

  it('reduces a stored set back to the hand-picked keys', () => {
    const stored = expandPermissions(catalogue, ['CRM.CHAT.TRANSFER']);
    expect(minimalPermissions(catalogue, stored)).toEqual(['CRM.CHAT.TRANSFER']);
    expect(expandPermissions(catalogue, minimalPermissions(catalogue, stored)).sort()).toEqual([...stored].sort());
  });

  it('keeps one side of an implies cycle', () => {
    const cyclic: PermissionCatalogue = {
      ...catalogue,
      groups: [{ name: 'G', features: [{ ...catalogue.groups[0].features[1], actions: [action('A.X', ['B.X']), action('B.X', ['A.X'])] }] }],
    };
    expect(minimalPermissions(cyclic, ['A.X', 'B.X'])).toHaveLength(1);
  });
});
