/**
 * A free-form WhatsApp message: text, or an image / video / document with a
 * caption. Files come from the phone and are uploaded straight away; text can
 * mix in lead fields. WhatsApp delivers these only within 24 hours of the
 * lead's last message, which the note under the composer says.
 */
import { Image } from 'expo-image';
import { Clock, FileText, Image as ImageIcon, MessageSquare, Paperclip, Video } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Row, Text } from '@/components/ui';
import { showAlert } from '@/lib/dialog';
import { MAX_BYTES, pickForFormat } from '@/lib/pickFile';
import { describeCrmError } from '@/services/crm/client';
import type { SessionMessage } from '@/services/crm/sequences';
import { sessionFormat, SESSION_TYPES, uploadSendMedia, type SessionType } from '@/services/crm/whatsapp';
import { useTheme } from '@/theme/ThemeProvider';
import { TokenTextInput } from './TokenTextInput';

const ICON: Record<SessionType, typeof MessageSquare> = { text: MessageSquare, image: ImageIcon, video: Video, document: FileText };

export const isSessionReady = (m: SessionMessage) => (m.type === 'text' ? !!m.text.trim() : !!m.media?.link);

export function SessionComposer({
  value,
  onChange,
  bubble,
  windowNote = true,
  textOnly,
}: {
  value: SessionMessage;
  onChange: (m: SessionMessage) => void;
  /** Draw the text as an outgoing WhatsApp message. */
  bubble?: boolean;
  /** The "within 24 hours" note: only API sends have that limit. */
  windowNote?: boolean;
  /** Text messages only: the WhatsApp app (opened with the text filled in) can't carry an image, video or file. */
  textOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);

  const pick = async () => {
    if (value.type === 'text') return;
    const format = sessionFormat(value.type);
    const f = await pickForFormat(format);
    if (!f) return;
    if (f.size && f.size > MAX_BYTES[format]) return showAlert(t('wa.tooLarge'), t('wa.tooLargeBody', { mb: Math.round(MAX_BYTES[format] / 1048576) }));
    setUploading(true);
    setLocalUri(f.uri);
    try {
      const link = await uploadSendMedia(format, f);
      onChange({ ...value, media: { link, filename: f.name, mimeType: f.mimeType } });
    } catch (err) {
      setLocalUri(null);
      showAlert(t('wa.uploadFailed'), describeCrmError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Row gap={4} style={{ flexWrap: 'wrap', display: textOnly ? 'none' : 'flex' }}>
        {SESSION_TYPES.map((ty) => {
          const Icon = ICON[ty];
          const on = value.type === ty;
          return (
            <Pressable
              key={ty}
              onPress={() => {
                setLocalUri(null);
                onChange({ type: ty, text: value.text, media: undefined });
              }}
              style={[styles.type, { backgroundColor: on ? colors.primarySoft : 'transparent' }]}
            >
              <Icon size={14} color={on ? colors.primary : colors.textMuted} />
              <Text variant="caption" style={{ color: on ? colors.primary : colors.text, fontWeight: '500' }}>
                {t(`wa.session.${ty}`)}
              </Text>
            </Pressable>
          );
        })}
      </Row>

      {value.type !== 'text' && !textOnly ? (
        <Pressable
          onPress={() => void pick()}
          style={[styles.drop, { borderColor: value.media ? colors.success : colors.borderStrong, borderRadius: radius.md }]}
        >
          {value.type === 'image' && (localUri || value.media?.link) ? (
            <Image source={{ uri: localUri ?? value.media?.link }} style={styles.thumb} contentFit="cover" />
          ) : uploading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Paperclip size={20} color={value.media ? colors.success : colors.primary} />
          )}
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {value.media?.filename ?? t('wa.pickMedia', { kind: t(`wa.session.${value.type}`).toLowerCase() })}
            </Text>
            <Text variant="caption" tone={value.media ? 'success' : 'muted'}>
              {uploading ? t('wa.uploading') : value.media ? t('wa.attached') : value.type === 'document' ? t('wa.fromFiles') : t('wa.fromGallery')}
            </Text>
          </View>
        </Pressable>
      ) : null}

      <TokenTextInput
        label={value.type === 'text' ? t('wa.message') : t('wa.caption')}
        value={value.text}
        onChange={(text) => onChange({ ...value, text })}
        placeholder={value.type === 'text' ? t('wa.messagePh') : t('wa.captionPh')}
        minHeight={value.type === 'text' ? 72 : 44}
        bubble={bubble}
      />

      {windowNote ? (
        <Row gap={6} style={{ alignItems: 'flex-start' }}>
          <Clock size={14} color={colors.warning} style={{ marginTop: 2 }} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            {t('wa.windowNote')}
          </Text>
        </Row>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  type: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  drop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1.5, borderStyle: 'dashed' },
  thumb: { width: 48, height: 48, borderRadius: 8 },
});
