/**
 * Web: Firebase Messaging token for this browser. Needs notification permission
 * already granted (asked from a user gesture, see ensureNotificationPermission)
 * and EXPO_PUBLIC_FIREBASE_VAPID_KEY. Background messages are shown by
 * public/firebase-messaging-sw.js (config passed in its URL); while the tab is open we show them here, unless the app is in front.
 */
import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from 'firebase/messaging';

import { env } from '@/config/env';
import { firebaseWebConfig, hasFirebaseWebConfig } from '@/config/firebase';

let listening = false;

const showForeground = (messaging: Messaging) => {
  if (listening) return;
  listening = true;
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title;
    // The app is on screen and already shows the message; only alert from a hidden tab.
    // Visible but behind another window still alerts (visibilityState stays 'visible' then).
    if (!title || (document.visibilityState === 'visible' && document.hasFocus())) return;
    const n = new Notification(title, { body: payload.notification?.body, icon: '/icon-192.png' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  });
};

export const getPushToken = async (): Promise<string | null> => {
  if (!env.firebaseVapidKey || !hasFirebaseWebConfig || !('Notification' in window) || Notification.permission !== 'granted') return null;
  if (!(await isSupported())) return null;
  const app = getApps()[0] ?? initializeApp(firebaseWebConfig);
  // The worker can't read .env: it gets the same config in its URL.
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${new URLSearchParams(firebaseWebConfig).toString()}`);
  const messaging = getMessaging(app);
  showForeground(messaging);
  return getToken(messaging, { vapidKey: env.firebaseVapidKey, serviceWorkerRegistration: registration });
};
