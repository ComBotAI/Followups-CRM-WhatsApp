/**
 * Runtime configuration. Every value comes from `EXPO_PUBLIC_*` variables in
 * `.env` (see `.env.example`), which Expo inlines at bundle time.
 *
 * Each variable is accessed statically (`process.env.EXPO_PUBLIC_X`) on
 * purpose: Expo's bundler replaces only literal member accesses, so a dynamic
 * `process.env[key]` would be empty in a real build.
 *
 * `missingEnv()` is checked once at startup so a misconfigured build fails
 * loudly on the first screen rather than with a confusing network error later.
 */
import { Platform } from 'react-native';

const clean = (value: string | undefined): string => (typeof value === 'string' && value.trim() ? value.trim().replace(/\/+$/, '') : '');

const raw = {
  EXPO_PUBLIC_SSO_URL: clean(process.env.EXPO_PUBLIC_SSO_URL),
  EXPO_PUBLIC_CPASS_BASE_URL: clean(process.env.EXPO_PUBLIC_CPASS_BASE_URL),
  EXPO_PUBLIC_FIREBASE_VAPID_KEY: clean(process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY),
  EXPO_PUBLIC_ACCESS_ID: clean(process.env.EXPO_PUBLIC_ACCESS_ID),

  // Brand
  EXPO_PUBLIC_APP_NAME: clean(process.env.EXPO_PUBLIC_APP_NAME),
  EXPO_PUBLIC_BRAND_NAME: clean(process.env.EXPO_PUBLIC_BRAND_NAME),
  EXPO_PUBLIC_APP_SLUG: clean(process.env.EXPO_PUBLIC_APP_SLUG),
  EXPO_PUBLIC_APP_SCHEME: clean(process.env.EXPO_PUBLIC_APP_SCHEME),
  EXPO_PUBLIC_ANDROID_PACKAGE: clean(process.env.EXPO_PUBLIC_ANDROID_PACKAGE),
  EXPO_PUBLIC_WEB_DOMAIN: clean(process.env.EXPO_PUBLIC_WEB_DOMAIN),
  // Kept as typed (trailing slash included) so the page opens without a redirect.
  EXPO_PUBLIC_DELETE_ACCOUNT_URL: (process.env.EXPO_PUBLIC_DELETE_ACCOUNT_URL ?? '').trim(),

  // Data store
  EXPO_PUBLIC_DATASTORE_TITLE: clean(process.env.EXPO_PUBLIC_DATASTORE_TITLE),

  // Firebase web app (web push)
  EXPO_PUBLIC_FIREBASE_API_KEY: clean(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: clean(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: clean(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: clean(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: clean(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  EXPO_PUBLIC_FIREBASE_APP_ID: clean(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
} as const;

const appName = raw.EXPO_PUBLIC_APP_NAME || 'Followups';
const appSlug = raw.EXPO_PUBLIC_APP_SLUG || 'followups';

// The project id is the "Access ID" (see services/accessId), and it serves both
// SDKs. Normally users enter it per account at sign-in; a build with
// EXPO_PUBLIC_ACCESS_ID set is locked to that one id and never asks.

/**
 * The origin SSO and CPaaS check against the project's allowed origins: the
 * browser's own address on the web, `http://localhost` from the phone app
 * (which sends no origin of its own).
 */
const appOrigin = Platform.OS === 'web' ? clean(globalThis.location?.origin) : 'http://localhost';

export const env = {
  ssoUrl: raw.EXPO_PUBLIC_SSO_URL,
  cpassBaseUrl: raw.EXPO_PUBLIC_CPASS_BASE_URL,
  appOrigin,
  /** Web push only (Firebase Console > Cloud Messaging > Web Push certificates). */
  firebaseVapidKey: raw.EXPO_PUBLIC_FIREBASE_VAPID_KEY,
  /** Optional fixed Access ID: when set, the app always uses it and never shows the Access ID screen. */
  fixedAccessId: raw.EXPO_PUBLIC_ACCESS_ID,
  /** Recorded on SSO sessions as the `client` of select-account. */
  ssoClientLabel: `${appSlug}-android`,

  // Brand (see docs/REBRANDING.md)
  /** Full app name, e.g. "Followups CRM". */
  appName,
  /** Company / short brand name ("contact <brand> support", "© <brand>"). */
  brandName: raw.EXPO_PUBLIC_BRAND_NAME || appName,
  appSlug,
  /** Deep-link scheme without "://", e.g. "followupscrm". */
  appScheme: raw.EXPO_PUBLIC_APP_SCHEME || appSlug.replace(/[^a-z0-9]/gi, '').toLowerCase(),
  /** Play Store application id. */
  androidPackage: raw.EXPO_PUBLIC_ANDROID_PACKAGE,
  /** Public web origin, e.g. https://app.example.com (empty when no web domain is set). */
  siteUrl: raw.EXPO_PUBLIC_WEB_DOMAIN ? `https://${raw.EXPO_PUBLIC_WEB_DOMAIN.replace(/^https?:\/\//, '')}` : '',
  /** Web page where users ask to delete their account and data (store requirement). Empty hides the More row. */
  deleteAccountUrl: raw.EXPO_PUBLIC_DELETE_ACCOUNT_URL,

  /** Title of the CRM data store the app keeps its data in. Changing it on a live app makes workspaces start a new, empty store. */
  datastoreTitle: raw.EXPO_PUBLIC_DATASTORE_TITLE || appName,

  /** Firebase web app config (public identifiers, not secrets). */
  firebaseWeb: {
    apiKey: raw.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: raw.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: raw.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: raw.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: raw.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: raw.EXPO_PUBLIC_FIREBASE_APP_ID,
  },
} as const;

export type MissingEnv = { key: keyof typeof raw; label: string };

/** Names every required variable that is empty or still a placeholder. */
export const missingEnv = (): MissingEnv[] => {
  const required: MissingEnv[] = [
    { key: 'EXPO_PUBLIC_SSO_URL', label: 'SSO URL' },
    { key: 'EXPO_PUBLIC_CPASS_BASE_URL', label: 'CPaaS base URL' },
    { key: 'EXPO_PUBLIC_APP_NAME', label: 'App name' },
  ];
  const placeholder = /example\.com|your-project-id|tpc_x{4,}/i;
  return required.filter(({ key }) => {
    const value = raw[key];
    return !value || placeholder.test(value);
  });
};
