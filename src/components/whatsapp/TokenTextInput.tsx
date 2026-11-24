/**
 * Text that mixes fixed words and contact fields ("Hi [[first_name]]…").
 *
 * One quiet "Insert field" button opens a searchable list; the picked field
 * goes in at the cursor as a `[[field]]` token, filled for each contact when
 * the message is sent. Under the box, a preview shows the text with field
 * names, so nobody has to read tokens.
 */
import { Braces, Search } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View, type TextInputSelectionChangeEvent } from 'react-native';

import { Sheet, Text } from '@/components/ui';
import { FIELD_TOKEN, fieldToken, type FieldOption } from '@/services/crm/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import { useVariableFields } from './VariableMapper';

export function TokenTextInput({
  value,
  onChange,
  placeholder,
  minHeight = 64,
  label,
  extraFields,
  bubble,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
  label?: string;
  /** More fields offered first, e.g. a CSV file's columns. */
  extraFields?: FieldOption[];
  /** Draw the box as an outgoing WhatsApp message. */
  bubble?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const leadFields = useVariableFields();
  const fields = useMemo(() => (extraFields?.length ? [...extraFields, ...leadFields] : leadFields), [extraFields, leadFields]);
  const selection = useRef({ start: value.length, end: value.length });
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const labelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
  const hasTokens = /\[\[\s*[a-zA-Z0-9_]+\s*\]\]/.test(value);
  const shown = search.trim() ? fields.filter((f) => f.label.toLowerCase().includes(search.trim().toLowerCase())) : fields;

  const insert = (key: string) => {
    const { start, end } = selection.current;
    const token = fieldToken(key);
    // A space before the token when it would otherwise stick to a word.
    const pad = start > 0 && !/\s$/.test(value.slice(0, start)) ? ' ' : '';
    onChange(value.slice(0, start) + pad + token + value.slice(end));
    const at = start + pad.length + token.length;
    selection.current = { start: at, end: at };
    setPicking(false);
    setSearch('');
  };

  const bubbleBg = colors.scheme === 'dark' ? '#0F2A20' : '#E7F8EE';
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="caption" tone="muted" style={{ fontWeight: '500' }}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.box,
          bubble
            ? { backgroundColor: bubbleBg, borderColor: 'transparent', borderRadius: radius.lg, borderTopEndRadius: 4 }
            : { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: radius.md },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          onSelectionChange={(e: TextInputSelectionChangeEvent) => {
            selection.current = e.nativeEvent.selection;
          }}
          placeholder={placeholder ?? t('wa.customTextPh')}
          placeholderTextColor={colors.textFaint}
          multiline
          style={[styles.input, { color: colors.text, fontFamily: fonts.regular, minHeight }]}
        />
        <View style={styles.bar}>
          <Pressable
            onPress={() => setPicking(true)}
            hitSlop={6}
            accessibilityRole="button"
            style={({ pressed }) => [styles.insert, { backgroundColor: pressed ? colors.surfacePressed : bubble ? 'rgba(255,255,255,0.7)' : colors.surfaceAlt }]}
          >
            <Braces size={14} color={colors.primary} />
            <Text variant="caption" tone="primary" style={{ fontWeight: '600' }}>
              {t('wa.insertField')}
            </Text>
          </Pressable>
        </View>
      </View>
      {hasTokens ? (
        <Text variant="caption" tone="muted">
          {t('wa.looksLike')}{' '}
          <Text variant="caption" style={{ fontWeight: '500' }}>
            {value.replace(FIELD_TOKEN, (_: string, k: string) => `‹${labelOf(k)}›`)}
          </Text>
        </Text>
      ) : null}

      <Sheet open={picking} onClose={() => setPicking(false)} title={t('wa.insertField')}>
        <View style={{ gap: 10 }}>
          <View style={[styles.search, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
            <Search size={16} color={colors.textFaint} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('common.search')}
              placeholderTextColor={colors.textFaint}
              autoCorrect={false}
              style={[styles.searchInput, { color: colors.text, fontFamily: fonts.regular }]}
            />
          </View>
          <View style={[styles.list, { borderColor: colors.border, borderRadius: radius.md }]}>
            {shown.map((f, i) => (
              <Pressable
                key={f.key}
                onPress={() => insert(f.key)}
                style={({ pressed }) => [
                  styles.option,
                  { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
                  i < shown.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {f.label}
                </Text>
                <Text variant="caption" tone="faint">
                  {fieldToken(f.key)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 8 },
  input: { fontSize: 15, lineHeight: 21, padding: 0, textAlignVertical: 'top' },
  bar: { flexDirection: 'row', justifyContent: 'flex-start' },
  insert: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, fontSize: 15 },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
});
