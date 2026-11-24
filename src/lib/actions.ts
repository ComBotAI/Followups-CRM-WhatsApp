/**
 * Outbound actions that leave the app: WhatsApp, SMS, phone, copy.
 */
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { whatsAppConfig } from '@/stores/whatsapp';

import { formatPhone, smsUri, telUri, toDialable, whatsappUri } from './phone';
import { showAlert } from '@/lib/dialog';

export const openWhatsApp = async (phone: string, text?: string) => {
  const url = whatsappUri(phone, text);
  try {
    await Linking.openURL(url);
  } catch {
    showAlert('WhatsApp not available', 'Install WhatsApp to message this lead.');
  }
};

export const openSms = async (phone: string, body?: string) => {
  try {
    await Linking.openURL(smsUri(phone, body));
  } catch {
    showAlert('Messages not available');
  }
};

/** Opens the phone's own dialer with the number filled in. Nothing is logged and no permission is needed. */
export const callPhone = async (phone: string) => {
  if (!phone) return;
  try {
    await Linking.openURL(telUri(toDialable(phone)));
  } catch {
    showAlert('Calling not available');
  }
};

export const copyPhone = async (phone: string) => {
  await Clipboard.setStringAsync(formatPhone(phone));
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

/** Long press on a WhatsApp button: the WhatsApp (Business) app itself, even in API mode. */
export const plainWhatsApp = (phone: string) => () => void (phone ? openWhatsApp(phone) : undefined);

/**
 * The WhatsApp button. With the WhatsApp API on and a known lead, opens the Send
 * template screen: the message goes out through the API (and, with coexistence,
 * shows in the WhatsApp Business app). Otherwise opens WhatsApp on the phone.
 */
export const messageOnWhatsApp = ({ phone, leadId }: { phone: string; leadId?: string | null }) => {
  if (leadId && whatsAppConfig().mode === 'api') {
    router.push({ pathname: '/(app)/whatsapp/send', params: { leadId } });
    return;
  }
  void openWhatsApp(phone);
};
