/**
 * Development only: `?preview=1` on the local web dev server opens the app as a
 * signed-in demo account (no server calls succeed), so every page's layout can
 * be checked in a desktop browser. Compiled out of production builds.
 */
import { Platform } from 'react-native';

import type { Channel } from '@ab-ecosystem/cpaas';

import { demo, demoUsesWhatsAppApp } from './previewDemo';

const PREVIEW_ID = 'preview:preview';

export const isWebPreview = (): boolean =>
  __DEV__ &&
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).has('preview') || sessionStorage.getItem('fcrm:preview') === '1');

/** Signs in the demo account: every feature on, WhatsApp API mode. */
export const startWebPreview = async () => {
  sessionStorage.setItem('fcrm:preview', '1');
  demo(); // remembers ?preview=bakery for the tab
  if (new URLSearchParams(window.location.search).get('preview') === 'member') sessionStorage.setItem('fcrm:preview-member', '1');
  const { useAccountsStore } = await import('@/stores/accounts');
  const { useWhatsAppStore } = await import('@/stores/whatsapp');
  // Let the saved stores load first, or they overwrite the demo account.
  const hydrated = (st: { persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void } }) =>
    st.persist.hasHydrated() ? Promise.resolve() : new Promise<void>((r) => st.persist.onFinishHydration(() => r()));
  await Promise.all([hydrated(useAccountsStore), hydrated(useWhatsAppStore)]);
  const accounts = useAccountsStore.getState();
  const d = demo();
  accounts.upsert({
    id: PREVIEW_ID,
    userId: 'preview',
    email: d.owner.email,
    name: `${d.owner.first} ${d.owner.last}`,
    workspaceId: 'preview',
    workspaceName: d.workspace,
    isOwner: true,
    roleTitle: 'Owner',
  });
  accounts.setActive(PREVIEW_ID);
  if (d.industry) {
    const { useVisitsStore } = await import('@/stores/visits');
    useVisitsStore.getState().set(PREVIEW_ID, { industry: d.industry, business: d.workspace, reviewLink: `g.page/${d.channels.ig[1]}` });
  }
  const { setTokenFor } = await import('@/stores/accounts');
  await setTokenFor(PREVIEW_ID, 'preview');
  if (demoUsesWhatsAppApp()) {
    useWhatsAppStore.getState().set(PREVIEW_ID, { mode: 'phone', channelId: null, channelName: '' });
  } else useWhatsAppStore.getState().set(PREVIEW_ID, { mode: 'api', channelId: 'preview-wa', channelName: d.channels.wa });
  return {
    token: 'preview',
    profile: { id: 'preview', firstName: d.owner.first, lastName: d.owner.last, email: d.owner.email, avatarUrl: '' },
  };
};

/** Sample channels for checking the channel pages: `/channels?preview=1`. */
export const previewChannels = (): Channel[] => {
  const base = (id: string, name: string, identity: string, color: string, extra: Partial<Channel> = {}): Channel => ({
    id,
    active: true,
    basic_details: { name, color_code: color, channel_identity: identity },
    meta: { category: 'whatsapp', provider: 'EMBEDDED', support_template: true, show_template: true, bypass_webhook_verification: false },
    wallet: { balance: 1250.5, currency: 'INR' },
    campaign_tps: 10,
    upgraded_webhook_listener: true,
    cloud: {
      instagram_id: '',
      is_instagram_business_login: false,
      waba_id: '1',
      business: '1',
      phone_number_id: '1',
      is_on_biz_app: false,
      version: 'v21.0',
      auto_read_receipt: 0,
      upgrade_eligibility: false,
      wa_biz_registration: 'completed',
    },
    api_only: false,
    crm_only: false,
    mm_lite_enabled: false,
    access_token: '',
    ...extra,
  });
  const names = demo().channels;
  return [
    // Business numbers too: 9 digits after +91, not a real number.
    base('preview-wa', names.wa, '91981234567', '#25D366'),
    base('preview-wa2', names.wa2, '91980001112', '#0EA5E9', {
      active: false,
      upgraded_webhook_listener: false,
      wallet: { balance: 0, currency: 'INR' },
      cloud: { ...base('x', '', '', '').cloud, wa_biz_registration: 'pending' },
    }),
    base('preview-ig', names.ig[0], names.ig[1], '', {
      meta: { category: 'instagram', provider: 'META', support_template: false, show_template: false, bypass_webhook_verification: false },
      wallet: { balance: 'NULL', currency: 'INR' },
    }),
    base('preview-sms', names.sms[0], names.sms[1], '#7C3AED', {
      meta: { category: 'sms', provider: 'SMS', support_template: false, show_template: false, bypass_webhook_verification: false },
      wallet: { balance: 'NULL', currency: 'INR' },
    }),
  ];
};

/**
 * `?preview=member`: the demo account signs in as a team member with the
 * Follow-up agent role instead of the owner, to check what members see.
 */
export const previewContext = () =>
  sessionStorage.getItem('fcrm:preview-member') === '1'
    ? {
        accountId: 'preview',
        act: 'member',
        isOwner: false,
        role: { id: 'preview-followup', title: 'Follow-up agent' },
        permission: [
          'CRM.CONTACT.LIST',
          'CRM.CONTACT.READ',
          'CRM.CONTACT.UPDATE',
          'CRM.CHAT.LIST',
          'CRM.CHAT.READ',
          'CRM.CHAT.SEND',
          'CRM.CHAT.SCHEDULED_MESSAGE.LIST',
          'CRM.CHAT.SCHEDULED_MESSAGE.CREATE',
          'CRM.TEMPLATE.LIST',
          'CRM.TEMPLATE.READ',
          'TEAM.LIST',
        ],
        accessExpiry: null,
        accountName: demo().workspace,
        accountEmail: '',
      }
    : { isOwner: true, accountName: demo().workspace };
