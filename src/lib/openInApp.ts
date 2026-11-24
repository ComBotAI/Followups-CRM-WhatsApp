/**
 * For pages an emailed link opens (verify, password reset): when
 * the link was tapped in a phone's browser instead of opening the installed app
 * (no App Link / Universal Link match yet, or a browser that ignores them), these
 * hand the same link over to the app.
 */
import { Platform } from 'react-native';

import { env } from '@/config/env';

export type Phone = 'android' | 'ios';

/** The web page is open in a phone's browser. */
export const onPhoneBrowser = (): Phone | null => {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  // iPadOS reports itself as a Mac: tell it apart by touch.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1)) return 'ios';
  return null;
};

/**
 * Opens the installed app on `path` (e.g. `login`). Android uses an
 * intent link, so a phone without the app goes to the Play Store instead of an error page.
 */
export const openInApp = (phone: Phone, path: string) => {
  const route = path.replace(/^\/+/, '');
  const store = `https://play.google.com/store/apps/details?id=${env.androidPackage}`;
  window.location.href =
    phone === 'android'
      ? `intent://${route}#Intent;scheme=${env.appScheme};package=${env.androidPackage};S.browser_fallback_url=${encodeURIComponent(store)};end`
      : `${env.appScheme}://${route}`;
};
