/**
 * Maps each template variable to where its value comes from: a lead field
 * (filled per lead at send time) or fixed text. Shows the value it resolves
 * to for the current lead, if there is one.
 */
import { ChevronDown } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Sheet, Text } from '@/components/ui';
import { useFields } from '@/hooks/queries';
import { isUserField } from '@/services/crm/schema';
import { BASE_FIELDS, FIELD_TOKEN, fieldToken, type FieldOption, type Slot } from '@/services/crm/whatsapp';
import type { VariableSource } from '@/stores/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { TokenTextInput } from './TokenTextInput';

/** Built-in fields plus the user's own `lead_x_*` fields. */
export const useVariableFields = (): FieldOption[] => {
  const fields = useFields();
  const { t } = useTranslation();
  return useMemo(
    () => [
      ...BASE_FIELDS.map((f) => ({ key: f.key, label: String(t(`wa.field.${f.key}`, { defaultValue: f.label })) })),
      ...(fields.data ?? []).filter((f) => isUserField(f.slug)).map((f) => ({ key: f.slug, label: f.name ?? f.slug })),
    ],
    [fields.data, t],
  );
};

const slotLabel = (s: Slot, t: TFunction) =>
  s.part === 'header' ? t('wa.slotHeader', { name: s.name }) : s.part === 'button' ? t('wa.slotButton', { name: s.name }) : `{{${s.name}}}`;

export function VariableMapper({
  slots,
  mapping,
  onChange,
  resolve,
  extraFields,
}: {
  slots: Slot[];
  mapping: Record<string, VariableSource>;
  onChange: (next: Record<string, VariableSource>) => void;
  /** The value a slot resolves to for the current lead (for the hint line). */
  resolve?: (slot: Slot) => string;
  /** More sources offered first, e.g. a CSV file's columns. */
  extraFields?: FieldOption[];
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const leadFields = useVariableFields();
  const fields = extraFields?.length ? [...extraFields, ...leadFields] : leadFields;
  const [editing, setEditing] = useState<Slot | null>(null);

  if (!slots.length)
    return (
      <Text variant="caption" tone="muted">
        {t('wa.noVariables')}
      </Text>
    );

  return (
    <View style={{ gap: 8 }}>
      {slots.map((s) => {
        const m = mapping[s.key];
        const label = !m
          ? t('wa.choose')
          : m.kind === 'text'
            ? `“${m.value.replace(FIELD_TOKEN, (_: string, k: string) => `{${fields.find((f) => f.key === k)?.label ?? k}}`)}”`
            : (fields.find((f) => f.key === m.key)?.label ?? m.key);
        const value = resolve?.(s);
        return (
          <Pressable
            key={s.key}
            onPress={() => setEditing(s)}
            style={({ pressed }) => [
              styles.row,
              { borderRadius: radius.md, borderColor: m ? colors.border : colors.warning, backgroundColor: pressed ? colors.surfaceAlt : colors.surface },
            ]}
          >
            <View style={[styles.slot, { backgroundColor: colors.primarySoft }]}>
              <Text variant="caption" style={{ color: colors.primary, fontWeight: '800' }}>
                {slotLabel(s, t)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1} tone={m ? 'default' : 'warning'}>
                {label}
              </Text>
              {m && resolve ? (
                <Text variant="caption" tone={value ? 'muted' : 'danger'} numberOfLines={1}>
                  {value ? `→ ${value}` : t('wa.emptyForLead')}
                </Text>
              ) : null}
            </View>
            <ChevronDown size={16} color={colors.textMuted} />
          </Pressable>
        );
      })}
      {editing ? (
        <SourceSheet
          slot={editing}
          current={mapping[editing.key]}
          extraFields={extraFields}
          onClose={() => setEditing(null)}
          onPick={(src) => {
            onChange({ ...mapping, [editing.key]: src });
            setEditing(null);
          }}
        />
      ) : null}
    </View>
  );
}

function SourceSheet({
  slot,
  current,
  extraFields,
  onClose,
  onPick,
}: {
  slot: Slot;
  current?: VariableSource;
  extraFields?: FieldOption[];
  onClose: () => void;
  onPick: (s: VariableSource) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(current?.kind === 'text' ? current.value : current?.kind === 'field' ? fieldToken(current.key) : '');
  // A value that is exactly one field token is stored as that field.
  const use = () => {
    const v = text.trim();
    const only = /^\[\[\s*([a-zA-Z0-9_]+)\s*\]\]$/.exec(v);
    onPick(only ? { kind: 'field', key: only[1] } : { kind: 'text', value: v });
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('wa.mapTitle', { name: slot.name })}
      subtitle={t('wa.mapSub')}
      footer={<Button title={t('wa.useValue')} disabled={!text.trim()} onPress={use} />}
    >
      <View style={{ gap: 6 }}>
        <TokenTextInput value={text} onChange={setText} extraFields={extraFields} />
        {!text.trim() ? (
          <Text variant="caption" tone="faint">
            {t('wa.mixHint')}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1 },
  slot: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
});
