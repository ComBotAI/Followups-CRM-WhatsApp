/**
 * App config. Everything brand-specific (name, ids, domain, colour) comes from
 * `.env` (copy `.env.example`), so the same source can ship under any brand.
 * See docs/REBRANDING.md. Run `npx expo config` to see the resolved result.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

// Expo CLI loads .env before reading this file; eas-cli may not, so load it here too.
// Variables already set (shell, EAS environment variables) win over the file.
try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.('.env');
} catch {
  // no .env: values must come from the environment
}

const read = (key: string) => (process.env[key] ?? '').trim();
const need = (key: string) => {
  const value = read(key);
  if (!value) throw new Error(`[app.config] ${key} is not set. Copy .env.example to .env and fill it in (see docs/REBRANDING.md).`);
  return value;
};

const APP_NAME = need('EXPO_PUBLIC_APP_NAME');
const SLUG = need('EXPO_PUBLIC_APP_SLUG');
const ANDROID_PACKAGE = need('EXPO_PUBLIC_ANDROID_PACKAGE');
const IOS_BUNDLE_ID = read('EXPO_PUBLIC_IOS_BUNDLE_ID') || ANDROID_PACKAGE;
const SCHEME = read('EXPO_PUBLIC_APP_SCHEME') || SLUG.replace(/[^a-z0-9]/gi, '').toLowerCase();
const WEB_DOMAIN = read('EXPO_PUBLIC_WEB_DOMAIN').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const BRAND_COLOR = read('EXPO_PUBLIC_BRAND_COLOR') || '#2F5BEA';
const EAS_PROJECT_ID = read('EAS_PROJECT_ID');
const EAS_OWNER = read('EAS_OWNER');
const GOOGLE_SERVICES_JSON = read('GOOGLE_SERVICES_JSON') || './google-services.json';
const GOOGLE_SERVICE_INFO_PLIST = read('GOOGLE_SERVICE_INFO_PLIST') || './GoogleService-Info.plist';

/** Email links the app opens directly (App Links / Universal Links) on WEB_DOMAIN. */
const LINK_PATHS = ['/verify', '/reset-password'];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: SLUG,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: SCHEME,
  userInterfaceStyle: 'automatic',
  ...(EAS_OWNER ? { owner: EAS_OWNER } : {}),
  ios: {
    icon: './assets/images/icon.png',
    supportsTablet: false,
    bundleIdentifier: IOS_BUNDLE_ID,
    googleServicesFile: GOOGLE_SERVICE_INFO_PLIST,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      LSApplicationQueriesSchemes: ['tel', 'whatsapp'],
      UIBackgroundModes: ['remote-notification', 'fetch'],
    },
    ...(WEB_DOMAIN ? { associatedDomains: [`applinks:${WEB_DOMAIN}`] } : {}),
  },
  android: {
    package: ANDROID_PACKAGE,
    googleServicesFile: GOOGLE_SERVICES_JSON,
    adaptiveIcon: {
      backgroundColor: BRAND_COLOR,
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
      backgroundImage: './assets/images/android-icon-background.png',
    },
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: 'resize',
    permissions: [
      'android.permission.READ_CONTACTS',
      'android.permission.WRITE_CONTACTS',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.VIBRATE',
      'android.permission.INTERNET',
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
    ],
    // Voice notes and videos only play in the open chat: no background media playback service.
    // Exact alarms dropped: reminders may arrive a few minutes late on an idle phone, which is fine.
    blockedPermissions: ['android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'android.permission.SCHEDULE_EXACT_ALARM', 'android.permission.USE_EXACT_ALARM', 'android.permission.FOREGROUND_SERVICE_DATA_SYNC', 'android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING'],
    ...(WEB_DOMAIN
      ? {
          intentFilters: [
            {
              action: 'VIEW',
              autoVerify: true,
              data: LINK_PATHS.map((pathPrefix) => ({ scheme: 'https', host: WEB_DOMAIN, pathPrefix })),
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ],
        }
      : {}),
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/images/splash-icon.png',
        imageWidth: 180,
        dark: { backgroundColor: '#0B0D12' },
      },
    ],
    ['expo-secure-store', { configureAndroidBackup: true }],
    ['expo-contacts', { contactsPermission: `${APP_NAME} uses your contacts to add them as leads and match WhatsApp chats to them.` }],
    ['expo-notifications', { icon: './assets/images/android-icon-monochrome.png', color: BRAND_COLOR, defaultChannel: 'reminders' }],
    'expo-sharing',
    '@react-native-community/datetimepicker',
    'expo-localization',
    'expo-background-task',
    ['expo-camera', { cameraPermission: `Allow ${APP_NAME} to use the camera to scan your Access ID QR code.`, recordAudioAndroid: false }],
    ['expo-image-picker', { photosPermission: `Allow ${APP_NAME} to attach photos to WhatsApp messages.` }],
    'expo-font',
    [
      'expo-build-properties',
      {
        android: {
          extraProguardRules:
            '# WorkManager (used by expo-background-task) opens its Room database by class name;\n# R8 must keep those classes or the app crashes at start-up.\n-keep class androidx.work.** { *; }\n-keep class * extends androidx.room.RoomDatabase { *; }\n-keep class androidx.room.** { *; }\n-dontwarn androidx.room.paging.**',
        },
        ios: { useFrameworks: 'static' },
      },
    ],
    ['expo-audio', { microphonePermission: `Allow ${APP_NAME} to record voice notes for WhatsApp.`, enableBackgroundPlayback: false }],
    'expo-asset',
    ['expo-video', { supportsBackgroundPlayback: false, supportsPictureInPicture: false }],
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    // Tablets / Chromebooks: no hardware feature is required (see the plugin for why).
    './plugins/withOptionalHardware',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: { asyncRoutes: { web: true } },
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
