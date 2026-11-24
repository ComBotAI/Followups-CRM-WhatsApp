/**
 * "WhatsApp to send" rows: who, which series step, the message, when. The
 * WhatsApp button opens the chat with the text filled in and marks the task
 * sent; ✕ skips it.
 */
import { MessageCircle, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components/ui';
import { showAlert } from '@/lib/dialog';
import { formatPhone, whatsappUri } from '@/lib/phone';
import { formatWhen } from '@/lib/time';
import { describeCrmError } from '@/services/crm/client';
import { markTaskQueued, type WaTask } from '@/services/crm/waTasks';
import { useTheme } from '@/theme/ThemeProvider';

export function WaTaskRow({ task, overdue, showName = true, onChanged }: { task: WaTask; overdue?: boolean; showName?: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const [busy, setBusy] = useState(false);
  // Skipped a moment ago: a few seconds to undo before it is deleted.
  const [skipping, setSkipping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitSkip = useRef<(() => void) | null>(null);
  // Leaving the screen during the undo window still skips it.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      commitSkip.current?.();
    },
    [],
  );

  const send = async () => {
    setBusy(true);
    try {
      await Linking.openURL(whatsappUri(task.phone, task.text));
    } catch (e) {
      setBusy(false);
      return showAlert(t('waTasks.failed'), describeCrmError(e));
    }
    // Marked on the phone first (uploaded when it can be): even offline it is never offered again.
    await markTaskQueued(task.id, 'sent');
    setBusy(false);
    onChanged();
  };

  const skip = () => {
    setSkipping(true);
    commitSkip.current = () => {
      commitSkip.current = null;
      void markTaskQueued(task.id, 'skipped').then(onChanged);
    };
    timer.current = setTimeout(() => commitSkip.current?.(), 5000);
  };
  const undo = () => {
    if (timer.current) clearTimeout(timer.current);
    commitSkip.current = null;
    setSkipping(false);
  };

  if (skipping)
    return (
      <View style={styles.row}>
        <Text variant="caption" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
          {t('waTasks.skipped', { defaultValue: 'Skipped · {{name}}', name: task.contactName || formatPhone(task.phone) })}
        </Text>
        <Pressable onPress={undo} hitSlop={8} style={{ padding: 6 }} accessibilityRole="button">
          <Text variant="bodyStrong" tone="primary">
            {t('common.undo', { defaultValue: 'Undo' })}
          </Text>
        </Pressable>
      </View>
    );

  return (
    <View style={styles.row}>
      {showName ? <Avatar name={task.contactName || task.phone} size={40} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        {showName ? (
          <Text variant="bodyStrong" numberOfLines={1}>
            {task.contactName || formatPhone(task.phone)}
          </Text>
        ) : null}
        <Text variant="caption" tone={overdue ? 'danger' : 'muted'} numberOfLines={1}>
          {formatWhen(task.dueAt)} · {task.sequenceName} · {t('waTasks.step', { n: task.stepIndex + 1 })}
        </Text>
        <Text variant="caption" numberOfLines={2}>
          {task.text}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <Pressable onPress={skip} hitSlop={8} style={{ padding: 4 }}>
            <X size={18} color={colors.textFaint} />
          </Pressable>
          <Pressable onPress={() => void send()} style={[styles.wa, { borderRadius: radius.md }]} hitSlop={6}>
            <MessageCircle size={20} color="#fff" />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  wa: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#25D366' },
});
