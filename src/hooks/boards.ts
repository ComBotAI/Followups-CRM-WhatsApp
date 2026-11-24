import type { CustomField } from '@ab-ecosystem/cpaas';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useFields, useLeadOptions } from '@/hooks/queries';
import { dropdownOptions, F, isAccountDropdown } from '@/services/crm/schema';

export type Board = { slug: string; label: string; options: string[] };

/** Every dropdown field is a board: built-ins first, then the account's own (added here or already in CPaaS). */
export const useBoards = (): Board[] => {
  const { t } = useTranslation();
  const options = useLeadOptions();
  const fields = useFields();
  return useMemo(
    () => [
      { slug: F.status, label: t('common.status'), options: options.statuses },
      ...(fields.data ?? [])
        .filter((f: CustomField) => isAccountDropdown(f))
        .map((f) => ({ slug: f.slug, label: f.name ?? f.slug, options: dropdownOptions(f) })),
    ],
    [options.statuses, fields.data, t],
  );
};
