/**
 * Swipeable contact-type filter: All · Leads · Customers · Friends & Family ·
 * whatever the account added to the Contact type field. Used on Contacts and
 * in the inbox.
 */
import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip, Sheet, Text } from '@/components/ui';
import { useLeadOptions } from '@/hooks/queries';
import { useTheme } from '@/theme/ThemeProvider';

export function ContactTypeBar({ value, onChange }: { value: string; onChange: (type: string) => void }) {
  const { t } = useTranslation();
  const { contactTypes } = useLeadOptions();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Chip small label={t('leads.allTypes')} selected={!value} onPress={() => onChange('')} />
      {contactTypes.map((type) => (
        <Chip
          key={type}
          small
          label={t(`contactType.${type}`, { defaultValue: type })}
          selected={value === type}
          onPress={() => onChange(value === type ? '' : type)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingHorizontal: 16, paddingVertical: 4 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 14, borderRadius: 12 },
});

/**
 * Phones: the same choice as one chip ("All types ▾") that opens a short list,
 * so it can share a row with the other filters instead of taking its own.
 */
export function ContactTypeSelect({ value, onChange }: { value: string; onChange: (type: string) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { contactTypes } = useLeadOptions();
  const [open, setOpen] = useState(false);
  // "All types", not "All": it sits next to other filters that have an "All" of their own.
  const label = value ? t(`contactType.${value}`, { defaultValue: value }) : t('leads.anyType');
  const pick = (type: string) => {
    setOpen(false);
    onChange(type);
  };
  return (
    <>
      <Chip
        small
        label={label}
        selected={!!value}
        icon={<ChevronDown size={13} color={value ? colors.primary : colors.textMuted} />}
        onPress={() => setOpen(true)}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={t('leads.contactType')}>
        <View style={{ gap: 6 }}>
          {['', ...contactTypes].map((type) => {
            const on = value === type;
            return (
              <Pressable
                key={type || 'all'}
                onPress={() => pick(type)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.option, { backgroundColor: on ? colors.primarySoft : colors.surfaceAlt }]}
              >
                <Text variant="bodyStrong" style={{ flex: 1, color: on ? colors.primary : colors.text }}>
                  {type ? t(`contactType.${type}`, { defaultValue: type }) : t('leads.allTypes')}
                </Text>
                {on ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}
