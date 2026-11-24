/**
 * "/" quick replies for any text box: type `/` (optionally followed by part of
 * a reply's name) and matching replies appear; picking one hands it back.
 */
import { MessagesSquare, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useQuickReplies } from '@/hooks/queries';
import { useWhatsAppConfig } from '@/stores/whatsapp';
import type { QuickReply } from '@/services/crm/quickReplies';
import { useTheme } from '@/theme/ThemeProvider';

/** The `/word` being typed at the end of the text, if any. */
export const slashQuery = (text: string): string | null => {
  const m = /(?:^|\s)\/([\w-]*)$/.exec(text);
  return m ? m[1].toLowerCase() : null;
};

/** Replaces the trailing `/word` with the reply text. */
export const applySlash = (text: string, insert: string) => text.replace(/(^|\s)\/[\w-]*$/, (_, pre: string) => pre + insert);

export function QuickReplySuggest({ text, onPick, allowCanned = true }: { text: string; onPick: (r: QuickReply) => void; allowCanned?: boolean }) {
  const { t } = useTranslation();
  const { colors, radius, shadow } = useTheme();
  const replies = useQuickReplies();
  // Saved replies belong to the WhatsApp API channel: none with the WhatsApp app.
  const api = useWhatsAppConfig().mode === 'api';
  const q = slashQuery(text);
  if (q === null || !api) return null;
  const list = (replies.data ?? []).filter((r) => r.name.toLowerCase().includes(q) && (allowCanned || r.parts.some((p) => p.text))).slice(0, 8);

  return (
    <View style={[styles.box, shadow.floating, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
      {!list.length ? (
        <Text variant="caption" tone="muted" style={{ padding: 12 }}>
          {replies.isLoading ? t('common.loading') : t('quick.noMatch')}
        </Text>
      ) : (
        <ScrollView keyboardShouldPersistTaps="always" style={{ maxHeight: 240 }}>
          {list.map((r) => (
            <Pressable key={r.id} onPress={() => onPick(r)} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}>
              {r.kind === 'QUICK' ? <Zap size={16} color={colors.primary} /> : <MessagesSquare size={16} color={colors.accent} />}
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  /{r.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {r.kind === 'CANNED' ? `${t('quick.messages', { count: r.parts.length })} · ` : ''}
                  {r.parts.find((p) => p.text)?.text ?? r.parts[0]?.type}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
