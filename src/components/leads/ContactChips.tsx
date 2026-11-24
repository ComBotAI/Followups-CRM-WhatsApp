/**
 * A contact's dropdown values (type, status, fields the user
 * added) and tags as small chips, for inbox rows and the chat header. Shows a
 * few and counts the rest.
 */
import type { ContactTag } from '@ab-ecosystem/cpaas';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useFields } from '@/hooks/queries';
import { F, isAccountDropdown } from '@/services/crm/schema';
import { useTheme } from '@/theme/ThemeProvider';

const BUILT_IN: { slug: string; prefix?: string }[] = [
  { slug: F.contactType, prefix: 'contactType' },
  { slug: F.status, prefix: 'status' },
];

export function ContactChips({
  hash,
  tags,
  max = 4,
  scroll = false,
}: {
  hash?: Record<string, unknown> | null;
  tags?: ContactTag[] | null;
  max?: number;
  /** One scrollable line with everything (chat header) instead of a few + "+N". */
  scroll?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fields = useFields();
  const userDropdowns = (fields.data ?? []).filter(isAccountDropdown).map((f) => ({ slug: f.slug }));

  const values: { key: string; label: string; color?: string; field?: boolean }[] = [];
  for (const { slug, prefix } of [...BUILT_IN, ...userDropdowns] as { slug: string; prefix?: string }[]) {
    const v = hash?.[slug];
    if (typeof v !== 'string' || !v) continue;
    values.push({ key: slug, label: prefix ? t(`${prefix}.${v}`, { defaultValue: v }) : v, field: true });
  }
  // Services taken (a multi-select: a list of names).
  const taken = hash?.[F.services];
  if (Array.isArray(taken)) for (const v of taken) if (v) values.push({ key: `svc:${String(v)}`, label: String(v), field: true });
  for (const tg of tags ?? []) values.push({ key: tg.id, label: tg.icon ? `${tg.icon} ${tg.name}` : tg.name, color: tg.color || undefined });
  if (!values.length) return null;

  const shown = scroll ? values : values.slice(0, max);
  const rest = values.length - shown.length;
  const chips = (
    <>
      {shown.map((v) => (
        <View
          key={v.key}
          style={[
            styles.chip,
            v.field
              ? { backgroundColor: colors.primarySoft }
              : { backgroundColor: v.color ? `${v.color}22` : colors.surfaceAlt, borderColor: v.color ?? colors.border, borderWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <Text numberOfLines={1} style={[styles.text, { color: v.field ? colors.primary : colors.text }]}>
            {v.label}
          </Text>
        </View>
      ))}
      {rest > 0 ? (
        <View style={[styles.chip, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.text, { color: colors.textMuted }]}>+{rest}</Text>
        </View>
      ) : null}
    </>
  );
  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips}
    </ScrollView>
  ) : (
    <View style={[styles.row, { flexWrap: 'nowrap', overflow: 'hidden' }]}>{chips}</View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chip: { paddingHorizontal: 7, height: 18, borderRadius: 9, justifyContent: 'center', maxWidth: 120 },
  text: { fontSize: 10.5, fontWeight: '600' },
});
