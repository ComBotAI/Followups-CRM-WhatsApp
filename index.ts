/**
 * App entry. Installs a crash catcher before anything else loads, so an
 * error during start-up shows its message on screen (for a screenshot)
 * instead of the app silently closing, then hands over to Expo Router.
 */
import { Alert } from 'react-native';

const APP_NAME = process.env.EXPO_PUBLIC_APP_NAME || 'Followups CRM';

type ErrorUtilsLike = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => void;
};

const describe = (error: unknown) => {
  const e = error as { name?: string; message?: string; stack?: string } | undefined;
  return `${e?.name ?? 'Error'}: ${e?.message ?? String(error)}\n\n${(e?.stack ?? '').split('\n').slice(0, 12).join('\n')}`;
};

const utils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
if (utils) {
  const previous = utils.getGlobalHandler();
  let shown = false;
  utils.setGlobalHandler((error, isFatal) => {
    if (isFatal && !shown) {
      shown = true;
      // Keep the app alive and show what went wrong.
      try {
        Alert.alert(`${APP_NAME} hit an error`, describe(error));
        return;
      } catch {
        // fall through to the default handler
      }
    }
    previous(error, isFatal);
  });
}

try {
  // The background sync task must be defined at start-up even when Android starts the app headless:
  // then no screen renders, so the root layout (which imports it too) never loads.
  /* eslint-disable @typescript-eslint/no-require-imports -- must load after the catcher is installed */
  require('./src/polyfills');
  require('./src/services/background');
  require('expo-router/entry');
  /* eslint-enable @typescript-eslint/no-require-imports */
} catch (error) {
  Alert.alert(`${APP_NAME} could not start`, describe(error));
}
