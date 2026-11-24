/* Firebase Messaging service worker: shows push notifications while the web app
 * is closed or in a background tab. Clicks open webpush.fcmOptions.link, which
 * the CPaaS sets. The Firebase web config comes from the registration URL
 * (src/services/pushToken.web.ts passes the EXPO_PUBLIC_FIREBASE_* values), so
 * nothing brand-specific lives here. Keep the SDK version in step with the
 * `firebase` package. */
importScripts('https://www.gstatic.com/firebasejs/13.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
const config = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (config.apiKey && config.projectId && config.messagingSenderId && config.appId) {
  firebase.initializeApp(config);
  firebase.messaging();
}
