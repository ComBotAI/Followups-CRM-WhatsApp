import { FlashList } from '@shopify/flash-list';
import { Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { LeadCard } from '@/components/leads/LeadCard';
import { EmptyState, Loading, Screen } from '@/components/ui';
import { flatLeads, useLeads } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { useTheme } from '@/theme/ThemeProvider';

export default function SearchScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const [q, setQ] = useState('');
  // One request once typing pauses; nothing (not the whole list) until two characters are typed.
  const query = useDebounced(q.trim(), 300);
  const ready = query.length >= 2;
  const leads = useLeads({ search: query }, ready);
  const items = useMemo(() => (ready && q.trim().length >= 2 ? flatLeads(leads.data?.pages) : []), [leads.data, ready, q]);
  return (
    <Screen back padded={false} right={null}>
      <View
        style={[
          styles.search,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.md,
          },
        ]}
      >
        <Search size={16} color={colors.textFaint} />
        <TextInput
          autoFocus
          placeholder={t('leads.searchPlaceholder')}
          placeholderTextColor={colors.textFaint}
          value={q}
          onChangeText={setQ}
          style={[styles.input, { color: colors.text }]}
        />
        {q ? (
          <Pressable onPress={() => setQ('')}>
            <X size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <FlashList
        data={items}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16, paddingVertical: 5 }}>
            <LeadCard lead={item} compact />
          </View>
        )}
        ListEmptyComponent={
          q.trim().length >= 2 && (query !== q.trim() || leads.isFetching) ? (
            <Loading />
          ) : ready ? (
            <EmptyState title={t('searchPage.noMatches', { q: query })} body={t('searchPage.noMatchesBody')} />
          ) : (
            // Before anything is typed: say what can be found, instead of an empty page.
            <EmptyState icon={<Search size={26} color="#fff" />} title={t('searchPage.hintTitle')} body={t('searchPage.hintBody')} />
          )
        }
        onEndReached={() => leads.hasNextPage && !leads.isFetchingNextPage && void leads.fetchNextPage()}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  input: { flex: 1, fontSize: 16 },
});
