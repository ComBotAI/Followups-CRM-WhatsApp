# Followups CRM — architecture

WhatsApp follow-up app for local businesses on Expo (React Native 0.88, Expo SDK 58, Expo Router): contacts/leads, visits (check-in, services, industry templates), follow-up series and reminders, and WhatsApp messaging through the Business API (templates, campaigns, scheduled series) or the normal WhatsApp app. There is no in-app inbox: with coexistence, conversations live in the WhatsApp Business app. Android app plus a web build of the same codebase.

## The two SDKs and how they are used

| Concern | Package | How we use it |
| --- | --- | --- |
| Login, 2FA, account picker, team members (list, change role, remove), roles, `/me` | `@ab-ecosystem/sso` | **Types only.** The package ships React DOM screens (react-dom, localStorage, Tailwind) and exports no plain `login`/`signup` functions, so it cannot render in React Native. `src/services/sso/client.ts` is a thin fetch client against the same `/api/v1/projects/:projectId/...` endpoints, with every body/response shape taken from the package's compiled source. Its TypeScript types are imported with `import type`, which erases at build time. |
| Contacts, tags, segments, custom fields, data stores, scheduled messages, notifications, channels | `@ab-ecosystem/cpaas` | **Used directly.** It is a dependency-free fetch client. Two polyfills are loaded first (`src/polyfills.ts`): `react-native-url-polyfill` (the SDK builds requests with `new URL` + `searchParams`) and an `AbortSignal.timeout` shim (the SDK passes it as the fetch signal). `origin` is set explicitly because React Native sends no `origin` header and the gateway refuses the call without one off-browser. The token is a resolver function reading the auth store, so account switches never rebuild the client. |

Env (`.env`, inlined as `EXPO_PUBLIC_*`): SSO URL, CPaaS base URL, an optional fixed Access ID and the web push VAPID key. The request origin is the browser's on web and `http://localhost` from the phone app. See `.env.example`.

## Data model on the CPaaS workspace

**A lead is a CPaaS contact.** Native contact fields carry what they are for: `name`, `profile.whatsapp.identifier` (the phone), `tags`, `agent` (assignee), `team`, `lead_source`, `status` (live/trashed). Everything else lives in **custom fields** (`src/services/crm/schema.ts`). They are not created on sign-in: the workspace owner creates them in step 1 of Workspace setup (`ensureLeadSchema`, idempotent; see below):

| Slug | Type | Purpose |
| --- | --- | --- |
| `lead_status` | dropdown | New / Contacted / Follow-Up / Interested / Not Interested / No Response / Won / Lost (editable in Settings → Fields) |
| `lead_contact_type` | dropdown | Leads / Customers / Friends & Family (editable) |
| `lead_next_follow_up`, `lead_follow_up_note` | timestamp, text | Next follow-up; drives "Due today" and the Today queue |
| `lead_product`, `lead_priority` | dropdown | Product / Hot-Warm-Cold |
| `lead_last_remark`, `lead_assigned_name`, `lead_deal_value`, `lead_source_name`, `lead_email`, `lead_company`, `lead_city`, `lead_alt_phone` | misc | Display fields |
| `lead_services`, `lead_last_visit` | multi-select, timestamp | Services add-on |

Because these are ordinary custom fields, they show in the CPaaS panel, work in **segments** (saved filters), and can gate **scheduled-message drips** (`conditions: { field_id: 'lead_status', ... }`).

**History lives in a cloud data store** named after `EXPO_PUBLIC_DATASTORE_TITLE`, or the app name (“Followups CRM”) when that is empty (`src/services/crm/datastore.ts`, ids cached in MMKV). Which collections exist depends on the account's features: `Remarks` and `Reminders` (CRM), follow-up series and "WhatsApp to send" tasks (Auto follow-ups), services/visits/runs (Services), app settings and role permissions. `ensureDataStore` only finds the store and its tables; when there is none yet, the handle is unavailable with kind `setup`. Only the owner's explicit Workspace setup (`ensureDataStore(true, acct, { create: true, plan })`) creates the store on the picked plan and adds its tables. While the store is missing, or CPaaS refuses one (no data store in the subscription, or the wallet is short), rows stay on the device (MMKV) and upload later.

## Workspace setup

Nothing is created automatically on sign-in. On every sign-in `src/hooks/useWorkspaceSetup.ts` checks whether every lead custom field exists, and whether the data store and the tables the account's features need exist. If not:

- The **owner** is redirected to `/workspace-setup` (`src/app/(app)/workspace-setup.tsx`):
  1. **Lead fields**: a button runs `ensureLeadSchema`.
  2. **Data store**: loads the data store plans from CPaaS (`crm.dataStores.plans()`, with the account's store allowance). The owner picks a plan, and a cycle if it is paid; CPaaS charges paid plans to the CPaaS wallet. The store is then created on that plan and its tables are added.

  "Skip for now" defers it until the next sign-in.
- **Members** are not redirected. They see a banner (`SetupBanner`) that the owner must finish setup.

The banner and Settings → Setup link to the journey.

There is no billing in the app. The WhatsApp API channel option in Settings → WhatsApp is open to every account; channel quotas on the Channels screen come from the CPaaS backend.

**Assignment** writes the member's user id to `contact.agent` (+ `lead_assigned_name`). A role with `data_scope: own` then only sees leads assigned to that member — the CPaaS server enforces it. The round-robin pointer is kept locally per device; the saved rule applies to imports and new leads.

## WhatsApp: two modes

Settings → WhatsApp picks the mode per account:

- **API mode** (WhatsApp Business API channel on CPaaS, available to every account): templates (the WhatsApp button on a lead opens the Send template screen; long press opens the WhatsApp Business app), campaigns, scheduled messages, and follow-up series sent automatically.
- **Phone mode** (the normal WhatsApp app): message buttons open WhatsApp with the text filled in; follow-up series steps appear in "WhatsApp to send" with a notification when due.

## Background work (Android)

There is no foreground service: long jobs (contact import, template download) run while the app is open, with progress in the app (`src/services/work.ts`), and the live inbox socket reconnects whenever the app comes back to the front, including when it is opened from a new-message push. A WorkManager task (`fcrm-background-sync` in `src/services/background.ts`, expo-background-task) adds new phone contacts to accounts that turned auto-add on, about every 15 minutes.

## App structure

```
src/app                      Expo Router routes
  (auth)/access|login|otp|accounts|forgot          (no self sign-up, no invites: members are added in the SSO panel)
  (app)/(tabs)/contacts|board|more         (_layout.web.tsx = sidebar shell for the browser)
  (app)/workspace-setup · visits/* · lead/[id] · lead/new · today · follow-ups · reminders · wa-tasks · followups/* · chat/[id] · campaigns/* · whatsapp/* · channels/* · import · search · trash · settings/*
src/components/ui            design system (tokens in src/theme)
src/components/leads|whatsapp|campaigns|channels|services|visits
src/services/sso             native auth and team client
src/services/crm             client, schema, leads, datastore, records, assignment, importLeads, sequences, campaigns, whatsapp
src/services/visits          industry templates and visit set-up
src/stores                   auth, accounts, features, settings, visits, whatsapp (zustand, persisted to MMKV)
src/hooks/queries.ts         React Query hooks + cache keys
src/hooks/useWorkspaceSetup.ts  workspace setup checks and the owner redirect
```

## Web

Same routes. `src/services/storage/index.web.ts` swaps SecureStore/MMKV for localStorage; Build with `npx expo export --platform web` and host the `dist/` folder (static).

## Internationalisation and RTL

`src/i18n/index.ts` initialises an i18next instance with bundled resources for 17 languages (`src/i18n/locales/`). The device locale is picked on first launch; Settings → Language persists the choice in the settings store. All UI strings go through `t('…')`; CRM dropdown values (statuses, priorities) are stored in English on the contact and translated at display time via `status.*`, `priority.*` keys, so other CPaaS clients still read the same values.

Arabic and Urdu are RTL. `applyLanguage()` flips `I18nManager` on native (needs an app reload, offered in the Language screen) and `document.dir` on web. Layouts use `flexDirection: 'row'` (auto-mirrored) and `start`/`end` style properties instead of `left`/`right`. A Jest test asserts every locale has exactly the English key set and the same interpolation placeholders.

## Captcha

The SSO `auth-config` names the provider (`recaptcha` v2/v3 or `hcaptcha`) and site key. `src/components/captcha/` renders it: on Android a WebView loads a tiny page (`html.ts`) with `baseUrl = http://localhost` (the app's origin), so `localhost` must be in the key's allowed domains, and talks back via `postMessage`; on web the provider script is injected directly. `useCaptchaField(action)` gives each auth form the widget plus `getToken()`, which resolves a visible widget's token or executes reCAPTCHA v3 with the same actions the SSO package uses (`submit`; `verify_2fa` on the OTP step). Tokens are sent as `captchaToken` on login, verify-2fa and forgot-password, and the widget is reset after a failed submit because tokens are single-use.
