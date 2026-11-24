/**
 * "Served by": which team member did the visit, so its revenue is theirs in
 * Reports. Defaults to whoever is recording it ("Me"); hidden when the
 * workspace is one person.
 */
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Chip, Row, Text } from '@/components/ui';
import { useTeam } from '@/hooks/queries';
import { useMyId } from '@/stores/auth';

/** A team member a visit is credited to (`null`: the person recording it). */
export type ServedBy = { id: string; name: string } | null;

export function ServedByPicker({ value, onChange }: { value: ServedBy; onChange: (v: ServedBy) => void }) {
  const { t } = useTranslation();
  const team = useTeam();
  const myId = useMyId();
  // A member's team list may not say a status: only someone marked otherwise is left out.
  const others = (team.data ?? []).filter((m) => (!m.status || m.status === 'active') && m.userId && m.userId !== myId);
  if (!others.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text variant="caption" tone="muted" style={{ fontWeight: '500' }}>
        {t('visits.servedBy')}
      </Text>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        <Chip label={t('visits.me')} selected={!value} onPress={() => onChange(null)} />
        {others.map((m) => (
          <Chip key={m.userId} label={m.name} selected={value?.id === m.userId} onPress={() => onChange({ id: m.userId, name: m.name })} />
        ))}
      </Row>
    </View>
  );
}
