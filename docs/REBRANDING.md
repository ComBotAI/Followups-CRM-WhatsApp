# Ship this app under a brand

This guide is for shipping this source under a name, store listing and backend project: Followups CRM as it is configured today, or a different brand.

You don't need to search the code for names or ids. Everything brand- or account-specific comes from one file, `.env`. The work is:

1. Fill in `.env`.
2. Swap the logo and icon images.
3. Set up the accounts (Expo, Firebase, backend project).
4. Build.

Plan for about an hour, plus the time your store review takes.

---

## 1. Fill in `.env`

```bash
cp .env.example .env
```

Every variable is explained in [.env.example](../.env.example). The ones that define the brand (current values shown):

| Variable | Followups CRM | Where it shows up |
| --- | --- | --- |
| `EXPO_PUBLIC_APP_NAME` | `Followups CRM` | Name under the launcher icon, the store, page titles, permission prompts, every language. The words after the first one ("CRM") are shown after the wordmark image |
| `EXPO_PUBLIC_BRAND_NAME` | `Followups CRM` | "Contact Followups CRM support", "© Followups CRM", share messages |
| `EXPO_PUBLIC_APP_SLUG` | `followups-crm` | Expo / EAS project slug |
| `EXPO_PUBLIC_APP_SCHEME` | `followupscrm` | Deep links (`followupscrm://lead/123`), push-notification taps, WhatsApp signup return |
| `EXPO_PUBLIC_ANDROID_PACKAGE` | `crm.followups.wa` | Play Store application id |
| `EXPO_PUBLIC_IOS_BUNDLE_ID` | (empty) | App Store bundle id (empty = same as Android, `crm.followups.wa`) |
| `EXPO_PUBLIC_BRAND_COLOR` | `#2F5BEA` | Android adaptive-icon background, notification accent |
| `EXPO_PUBLIC_WEB_DOMAIN` | your domain | Email links that open the app, SEO tags, sitemap |
| `EXPO_PUBLIC_DELETE_ACCOUNT_URL` | your page | "Delete account" in More (empty hides it) |

> **Pick the package / bundle id carefully.** You can't change it after the first upload to Google Play or the App Store. A new id is a new app, and existing users won't get it as an update.

The app checks the required values when it starts. If one is missing, the first screen names it, so you don't get a confusing error later. `app.config.ts` also refuses to build without the app name, slug and package.

To see the final app config your `.env` produces:

```bash
npx expo config
```

## 2. Swap the images

The current logo is a chat bubble whose outline is a circular follow-up arrow, with a check mark inside, white on a blue gradient tile (`#4C7DFF` → `#1F45D6`). To change it, replace these files with your own and keep the same file names and sizes:

| File | What it is |
| --- | --- |
| `assets/images/icon.png` | App icon, 1024×1024 |
| `assets/images/android-icon-foreground.png`, `-background.png`, `-monochrome.png` | Android adaptive icon layers |
| `assets/images/splash-icon.png` | Splash-screen logo. The native splash shows it 180 wide, and the in-app startup screen (`BootSplash`) picks up from the same image at the same size |
| `assets/images/favicon.png` | Web favicon source |
| `assets/brand/mark.png` | Square logo used inside the app (sign-in, About, menu) |
| `assets/brand/wordmark.png` | The tile + "Followups" (Inter ExtraBold), for light backgrounds. The app writes the rest of the app name ("CRM") after it in the primary colour |
| `assets/brand/wordmark-white.png` | Same for dark or blue backgrounds: white tile, blue glyph, white text |
| `assets/brand/mark-color.png`, `mark-white.png`, `icon-*.png` | Logo variants: blue glyph, white glyph, icon layers (marketing, splash) |
| `public/favicon.svg` (vector), `favicon-32.png`, `favicon-48.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Web app icons |
| `public/og-image.png` | Picture shown when a link to your site is shared (1200×630) |

If your wordmark has a different shape, update `WORDMARK_RATIO` in [src/components/Brand.tsx](../src/components/Brand.tsx) to its width ÷ height (currently `1480 / 275`). The wordmark image reads "Followups"; if your app name's first word is different, redraw it so the image plus the words the app adds still read as your name.

The tagline under the logo ("LEADS · WHATSAPP · FOLLOW-UPS") is in [src/components/Brand.tsx](../src/components/Brand.tsx).

### Colours (optional)

The app's blue comes from [src/theme/tokens.ts](../src/theme/tokens.ts), with light and dark values:

| Token | Light | Dark |
| --- | --- | --- |
| `primary` | `#2450DB` | `#5B82FF` |
| `primaryStrong` | `#1C3FB0` | `#3D68F5` |
| `primarySoft` | `#EEF2FE` | `#141D3A` |

Neutrals are cool greys, and the dark canvas is `#0B0D12`. To use another colour, change those three tokens, then also update:

- `EXPO_PUBLIC_BRAND_COLOR` in `.env`
- the first colour in `ACCOUNT_COLORS` in [src/stores/accounts.ts](../src/stores/accounts.ts) (the default account colour)
- `theme_color` in `public/manifest.webmanifest` (browser toolbar colour; `npm run brand:web` doesn't change it)

## 3. Set up the accounts

### Expo / EAS (cloud builds)

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

`eas init` creates a project under your account and prints its id. Put it in `.env`:

```
EAS_PROJECT_ID=<the id it printed>
EAS_OWNER=<your Expo account or organisation>
```

`EXPO_PUBLIC_APP_SLUG` must match the slug of that EAS project.

### Push notifications (Firebase)

The `google-services.json` and `GoogleService-Info.plist` in the project root still belong to the old app's Firebase project. Replace them before a release:

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) (or use an existing one).
2. **Android:** add an Android app with your `EXPO_PUBLIC_ANDROID_PACKAGE` (`crm.followups.wa`), download `google-services.json` and replace the one in the project root.
3. **iOS:** add an iOS app with your bundle id, download `GoogleService-Info.plist` and replace the one in the project root. Upload your APNs key under Project settings → Cloud Messaging.
4. **Web (optional):** add a Web app and copy its config values into the `EXPO_PUBLIC_FIREBASE_*` variables. Under Cloud Messaging → Web Push certificates, generate a key pair and put it in `EXPO_PUBLIC_FIREBASE_VAPID_KEY`. If you leave these empty, web push is off and the rest of the app works.

If you keep the Firebase files somewhere else, point `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICE_INFO_PLIST` at them.

Your push sender (the CPaaS project) also needs your Firebase project's server credentials. That's set on the backend, not in this app.

### Backend

In your SSO / CPaaS project:

| Variable | What to put |
| --- | --- |
| `EXPO_PUBLIC_SSO_URL`, `EXPO_PUBLIC_CPASS_BASE_URL` | Your backend origins |
| `EXPO_PUBLIC_DATASTORE_TITLE` | Name of the CRM data store. Leave empty to use the app name |
| `EXPO_PUBLIC_ACCESS_ID` | Optional: lock the app to your project so users never type an Access ID |

There is no billing or plan configuration in the app, no self sign-up and no in-app invites: team members are added in the SSO panel and sign in with their own login. Nothing is created on sign-in. The workspace owner goes through **Workspace setup** after signing in: first the lead fields, then a data store plan picked from the CPaaS catalogue, on which the store and its tables are created. Paid data store plans are charged to the CPaaS wallet by CPaaS.

> **Running app?** Don't change `EXPO_PUBLIC_DATASTORE_TITLE` (or the app name, if the title is empty) once people use the app. Workspaces look up their store by that name, so a new name starts a new, empty store.

Add your web domain (and `http://localhost` for the phone app) to the project's allowed origins.

### Web app (optional)

```bash
npm run build:web
```

This first runs `npm run brand:web`, which writes these files from `.env`:

- `public/manifest.webmanifest`: name and Play Store link
- `public/.well-known/assetlinks.json` and `apple-app-site-association`: so email links (verify, reset password) open the app instead of the browser
- `public/sitemap.xml`, `public/robots.txt`, `hosting/nginx.conf`: your domain

For the email links to open the app, also set these in `.env` before building:

- `ANDROID_SHA256_CERT_FINGERPRINTS`: your Android signing key's SHA-256. Get it from `npx eas-cli@latest credentials` → Android → Keystore.
- `APPLE_TEAM_ID`: your Apple Developer Team ID.

Then deploy `dist/` to your domain. The repo has config for Netlify, Vercel, Firebase Hosting and nginx.

## 4. Build

```bash
npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest submit --platform android
```

EAS Build uploads your `.env` with the build (`.easignore` doesn't exclude it), so the cloud build uses the same values. If you build from CI without a `.env` file, set the same variables as [EAS environment variables](https://docs.expo.dev/eas/environment-variables/) instead.

---

## Checklist

- [ ] `.env` filled in, `npx expo config` shows your name and ids
- [ ] App starts with no "missing configuration" screen
- [ ] Icons, splash, logo and web icons replaced (if not shipping as Followups CRM)
- [ ] (optional) theme colours changed
- [ ] EAS project created, `EAS_PROJECT_ID` / `EAS_OWNER` set
- [ ] `google-services.json` and `GoogleService-Info.plist` replaced with ones registered for `crm.followups.wa` (or your package / bundle id), push works on a real phone
- [ ] Workspace owner signs in and completes Workspace setup: lead fields, then a data store plan
- [ ] (web) `npm run build:web`, deployed, email links open the app
- [ ] Store listing: name, screenshots, privacy policy URL

## Text that mentions the brand

Translations use `{{appName}}` and `{{brandName}}`, which are filled from `.env`, so all 17 languages follow the rename automatically. If you add strings, use the same placeholders instead of writing the name. In code, use `env.appName` / `env.brandName` from [src/config/env.ts](../src/config/env.ts).

Internal names (storage keys under `fcrm`, the background task `fcrm-background-sync`) are never shown to users. Don't rename them on an app people already use: that signs everyone out and clears their data on the device.

The marketing page text (search descriptions and keywords) is in [src/lib/seo.ts](../src/lib/seo.ts). The name comes from `.env`, but you may want to rewrite the descriptions for your market.
