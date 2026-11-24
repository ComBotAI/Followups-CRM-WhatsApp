/**
 * Firebase web app config, from the EXPO_PUBLIC_FIREBASE_* variables in .env.
 * These are public identifiers (the same ones shipped in google-services.json /
 * GoogleService-Info.plist), not secrets. public/firebase-messaging-sw.js can't
 * import this file, so it gets the same values in its registration URL (see
 * services/pushToken.web).
 */
import { env } from './env';

export const firebaseWebConfig = env.firebaseWeb;

/** Whether the web app config is filled in (web push is off without it). */
export const hasFirebaseWebConfig = Object.values(firebaseWebConfig).every(Boolean);
