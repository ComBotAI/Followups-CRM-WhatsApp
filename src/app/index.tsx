import { Redirect } from 'expo-router';

import { homeHref } from '@/lib/authGuard';
import { useFeatures } from '@/stores/features';
import { useWhatsAppConfig } from '@/stores/whatsapp';

/** A direct hit on `/`: go to the account's home; the (app) layout sends signed-out users to sign in. */
export default function Index() {
  const features = useFeatures();
  const api = useWhatsAppConfig().mode === 'api';
  return <Redirect href={homeHref(features, api)} />;
}
