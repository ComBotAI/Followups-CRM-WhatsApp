/**
 * Plain-language summary of a lead filter, including the rules inside a
 * chosen segment, e.g. "Segment Hot Mumbai: City is Mumbai and Priority is
 * Hot · Status: Won". Used where a filter becomes a sequence condition, so
 * the user can see exactly what will be checked.
 */
import type { ContactFilterEntry } from '@ab-ecosystem/cpaas';
import { Layers } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Row, Text } from '@/components/ui';
import { useFields, useSegments, useTags } from '@/hooks/queries';
import { countActiveFilters, toRuns, type LeadFilter } from '@/lib/filters';
import { useTheme } from '@/theme/ThemeProvider';

const SYSTEM_LABEL: Record<string, string> = {
  tags: 'Tags',
  SYSTEM_IDENTIFIER: 'Phone',
  SYSTEM_CREATED_ON: 'Created',
  SYSTEM_UPDATED_ON: 'Updated',
};

export function ConditionSummary({ filter }: { filter: LeadFilter }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const segments = useSegments();
  const fields = useFields();
  const tags = useTags();
  if (!countActiveFilters(filter)) return null;

  const fieldName = (id: string) => SYSTEM_LABEL[id] ?? fields.data?.find((f) => f.slug === id)?.name ?? id;
  const valueText = (c: ContactFilterEntry) => {
    const v = c.value;
    if (c.field_id === 'tags') {
      const ids = Array.isArray(v) ? v : [v];
      return ids.map((id) => tags.data?.find((tg) => tg.id === id)?.name ?? String(id)).join(', ');
    }
    if (v == null || v === '') return '';
    return Array.isArray(v) ? v.join(', ') : String(v);
  };
  const rule = (c: ContactFilterEntry) => [fieldName(c.field_id), c.condition, valueText(c)].filter(Boolean).join(' ');

  const segment = filter.segment ? segments.data?.find((s) => s.id === filter.segment) : undefined;
  const runs = segment ? toRuns(segment.filter.conditions) : [];

  const others: string[] = [];
  if (filter.statuses?.length) others.push(`${t('filter.status')}: ${filter.statuses.map((s) => t(`status.${s}`, { defaultValue: s })).join(' / ')}`);
  if (filter.tags?.length) others.push(`${t('filter.tags')}: ${filter.tags.map((id) => tags.data?.find((tg) => tg.id === id)?.name ?? id).join(', ')}`);
  if (filter.due) others.push(t('filter.followUpDue'));
  if (filter.createdWithinDays) others.push(t('leads.addedToday'));
  if (filter.agent) others.push(t('filter.assignedTo'));

  return (
    <View style={{ gap: 6, padding: 10, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}>
      {filter.segment ? (
        <View style={{ gap: 4 }}>
          <Row gap={6}>
            <Layers size={14} color={colors.accent} />
            <Text variant="caption" style={{ fontWeight: '600' }}>
              {t('segments.title')}: {segment?.name ?? '…'}
            </Text>
          </Row>
          {segment ? (
            runs.length ? (
              runs.map((run, i) => (
                <Text key={i} variant="caption" tone="muted">
                  {i > 0 ? `${t('followup.or')} ` : ''}
                  {run.map(rule).join(` ${t('followup.and')} `)}
                </Text>
              ))
            ) : (
              <Text variant="caption" tone="muted">
                {t('followup.segmentAll')}
              </Text>
            )
          ) : null}
        </View>
      ) : null}
      {others.length ? (
        <Text variant="caption" tone="muted">
          {filter.segment ? `${t('followup.and')} ` : ''}
          {others.join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}
