/**
 * Boards. Every dropdown field (Status, and any dropdown the team adds in
 * Settings → Fields or already had in CPaaS) is a board. Pick one to see
 * leads as columns by its options.
 */
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Columns3, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { TAB_BAR_SPACE } from '@/components/navigation/FloatingTabBar';
import { Button, Card, Chip, Hero, HeroButton, Input, Row, Sheet, Text } from '@/components/ui';
import { keys, useFields } from '@/hooks/queries';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { showAlert } from '@/lib/dialog';
import { describeCrmError } from '@/services/crm/client';
import { createUserField, F } from '@/services/crm/schema';
import { useIsOwner } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { goBack } from '@/lib/nav';
import { useDesktop } from '@/hooks/useDesktop';
import { useBoards } from '@/hooks/boards';
import { rtlFlip } from '@/lib/rtl';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';

function BoardsScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const boards = useBoards();
  const isOwner = useIsOwner();
  const fieldsQ = useFields();
  const pull = usePullRefresh(() => fieldsQ.refetch());
  const [adding, setAdding] = useState(false);
  const desktop = useDesktop();

  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={pull.refreshing} onRefresh={() => void pull.onRefresh()} tintColor={colors.primary} colors={[colors.primary]} />
      }
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <Hero
        title={t('board.title')}
        subtitle={t('board.listSub')}
        left={
          // Phones open the board from Contacts; desktop has it in the sidebar.
          desktop ? undefined : (
            <HeroButton label={t('common.back')} onPress={() => goBack()}>
              <ArrowLeft size={18} color="#fff" style={rtlFlip()} />
            </HeroButton>
          )
        }
      />
      {/* Desktop: the boards as a grid of cards. */}
      <View style={[styles.body, desktop && styles.grid]}>
        {boards.map((b) => (
          <Card
            key={b.slug}
            onPress={() => router.push({ pathname: '/(app)/board/[slug]', params: { slug: b.slug } })}
            style={[{ gap: 12 }, desktop && styles.tile]}
          >
            <Row gap={12}>
              <View style={[styles.icon, { backgroundColor: colors.primarySoft, borderRadius: radius.md }]}>
                <Columns3 size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h3">{b.label}</Text>
                <Text variant="caption" tone="muted">
                  {t('board.columns', { count: b.options.length + (b.slug === F.status ? 0 : 1) })}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textFaint} style={rtlFlip()} />
            </Row>
            <View style={styles.preview}>
              {b.options.slice(0, 6).map((o) => (
                <View key={o} style={[styles.col, { backgroundColor: colors.surfaceAlt, borderRadius: 8 }]}>
                  <Text variant="micro" tone="muted" numberOfLines={1} style={{ letterSpacing: 0 }}>
                    {o}
                  </Text>
                </View>
              ))}
              {b.options.length > 6 ? (
                <Text variant="micro" tone="faint">
                  +{b.options.length - 6}
                </Text>
              ) : null}
            </View>
          </Card>
        ))}
        {isOwner ? (
          <Pressable
            onPress={() => setAdding(true)}
            style={[styles.add, desktop && styles.tile, { borderColor: colors.borderStrong, borderRadius: radius.lg }]}
          >
            <Plus size={18} color={colors.primary} />
            <Text variant="bodyStrong" tone="primary">
              {t('board.add')}
            </Text>
          </Pressable>
        ) : null}
        {adding ? <AddBoardSheet onClose={() => setAdding(false)} /> : null}
      </View>
    </ScrollView>
  );
}

/** New board = a new dropdown field; its options are the board's stages (columns). */
function AddBoardSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const fields = useFields();
  const [name, setName] = useState('');
  const [stages, setStages] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const addStage = () => {
    const v = draft.trim();
    if (v && !stages.includes(v)) setStages([...stages, v]);
    setDraft('');
  };

  const save = async () => {
    const pending = draft.trim() && !stages.includes(draft.trim()) ? [...stages, draft.trim()] : stages;
    if (!name.trim()) return showAlert(t('board.needName'));
    if (!pending.length) return showAlert(t('board.needStages'));
    setBusy(true);
    try {
      const created = await createUserField({ name, type: 'dropdown', options: pending, taken: (fields.data ?? []).map((f) => f.slug) });
      await qc.invalidateQueries({ queryKey: keys.fields });
      onClose();
      router.push({ pathname: '/(app)/board/[slug]', params: { slug: created.slug } });
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('board.add')}
      subtitle={t('board.addSub')}
      locked={busy}
      footer={<Button title={t('board.create')} loading={busy} onPress={() => void save()} />}
    >
      <View style={{ gap: 12 }}>
        <Input label={t('board.name')} value={name} onChangeText={setName} placeholder={t('board.namePh')} autoCapitalize="words" autoFocus />
        <Text variant="caption" tone="muted" style={{ fontWeight: '500' }}>
          {t('board.stages')}
        </Text>
        {stages.length ? (
          <View style={styles.stageList}>
            {stages.map((st, i) => (
              <Chip
                key={st}
                label={`${i + 1}. ${st}`}
                icon={
                  <Pressable hitSlop={8} onPress={() => setStages(stages.filter((x) => x !== st))}>
                    <X size={12} color={colors.textMuted} />
                  </Pressable>
                }
              />
            ))}
          </View>
        ) : null}
        <Row gap={8}>
          <View style={{ flex: 1 }}>
            <Input
              placeholder={t('board.addStage')}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={addStage}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>
          <Button icon={<Plus size={16} color="#fff" />} onPress={addStage} style={{ width: 48, paddingHorizontal: 0 }} />
        </Row>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stageList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  body: { paddingHorizontal: 16, gap: 12, marginTop: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingHorizontal: 24 },
  tile: { flexBasis: 340, flexGrow: 1, maxWidth: 520 },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  col: { paddingHorizontal: 8, paddingVertical: 4, maxWidth: 140 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderWidth: 1, borderStyle: 'dashed' },
});

/** Members whose role can't open this page get a short explanation instead. */
export default function BoardsScreenGate() {
  return (
    <RequireCan any={[P.contacts.list]}>
      <BoardsScreen />
    </RequireCan>
  );
}
