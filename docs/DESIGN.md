# Followups CRM — design system and screen plan

## Principles

1. **One primary action per screen.** Every screen answers "what does the user do next?" with one obvious, thumb-reachable control (WhatsApp, Check in, Save, Mark done). Secondary actions are quieter.
2. **Follow-up first.** Messaging a customer on WhatsApp is never more than one tap from a list row, and Today always says who to reach next.
3. **Show status, not data.** Rows show name, a coloured status dot and the one most useful line ("Follow-up overdue · 2d", "Next follow-up · in 3h"). Everything else lives one tap deeper.
4. **Clean & airy.** White (or near-black) canvas, lots of space, hairline dividers and outlined cards instead of fills and shadows. The brand blue is used only for actions and status.
5. **Forgiving.** Destructive actions confirm, saves show progress, empty states teach the next step, errors say what to do.
6. **Thumb zone.** Primary buttons sit at the bottom; headers hold navigation and low-frequency actions.

## Foundations

All values live in `src/theme/tokens.ts`; components only use the semantic roles.

| Token | Value |
| --- | --- |
| Primary (brand blue, `#2F5BEA`; logo tile gradient `#4C7DFF` → `#1F45D6`) | `#2450DB` light / `#5B82FF` dark |
| Primary strong | `#1C3FB0` light / `#3D68F5` dark |
| Primary soft | `#EEF2FE` light / `#141D3A` dark |
| Canvas / surface | `#FFFFFF` light / `#0B0D12` · `#12151C` dark (cool greys throughout) |
| Inset fill (inputs, chips, icon wells) | `#F5F7FA` light / `#181C25` dark |
| Border | `#EBEEF3` light / `#1F2430` dark |
| Radius | 6 / 8 / 10 / 14 / 20 / pill |
| Type (Inter) | Display 30/700, H1 24/700, H2 18/600, H3 15.5/600, Body 15, Caption 13, Micro 11 |
| Spacing | 4-pt grid; screen gutter 16; card padding 16 |
| Status colours | New blue · Contacted violet · Follow-Up amber · Interested / Won green · Not interested / Lost red · No response grey |

## Components

- **Hero** — the page header: large dark title on the canvas, a muted line under it, quiet round icon buttons on the right, an optional row under the title (search, summary card) and a hairline once content scrolls under it.
- **FloatingTabBar** — Visits · Contacts · Today · Follow-ups · More; tabs follow the account's features and the member's role, at most five.
- **Sidebar** (desktop web, `(app)/_layout.web.tsx`) — the same sections down the left, settings and profile at the bottom; a contact opens in a side panel.
- **ListRow** — avatar with status dot, title, one meta line, trailing slot (WhatsApp button / chevron / time).
- **Group / GroupRow** — grouped settings-style lists with icon wells.
- **SectionHeader** — small caps label with optional action.
- **SearchField** — filled, rounded, with clear button.
- **UnderlineTabs** — horizontal scrollable text tabs with count badges and an underline indicator.
- **Sheet** — bottom sheet with grabber, title, pinned footer; a centred dialog on desktop web.
- **EmptyState** — tinted icon disc, one-line title, one-line body, one action.
- **Button** — primary (solid blue), secondary (inset fill), outline, ghost, danger, WhatsApp.

## Screens

| Screen | Layout |
| --- | --- |
| Access ID / Login / Forgot / OTP | The Followups CRM logo (the tile + "Followups" wordmark, then "CRM" in the primary colour) and a short line on the canvas; the form below; single full-width primary button; captcha inside the form. |
| Account picker | Header + list of workspace rows (initial avatar, role, current tick). |
| Workspace setup | Owner only, shown after sign-in when something is missing: two step cards (Lead fields, Data store) each with one primary button; the data store step lists the CPaaS plans to pick from (and a cycle for paid ones). "Skip for now" below. Members see a banner instead. |
| **Visits** | The front desk: big "Check in" action, today's visits, guests due back, and the industry template set-up banner until one is chosen. |
| Check-in | Phone number first (finds the guest or creates one), visit type / services, spend, then save; follow-ups and reminders start from the visit. |
| **Contacts** | Header with count and search. Status / type tabs with counts. Rows: avatar + status dot, name, follow-up line, WhatsApp button. Long-press to multi-select → bottom action bar (Assign, Update, Delete). Board view opens from here. |
| **Contact detail** | Avatar, name, number (tap to copy), status pill. One wide WhatsApp button with Call and SMS beside it. Next-step card (follow-up / set reminder). Tabs: Activity (remarks timeline) · Reminders · Details · Visits · Messages (API mode). |
| Contact form | Grouped sections (Contact, Pipeline, More) with pinned Save. |
| **Today** | Task and WhatsApp reminders due today, then one ranked follow-up queue (overdue, due, reminders, new leads): WhatsApp or skip each one. |
| **Follow-ups** | Due (reminders, "WhatsApp to send"), Automations (follow-up series), Send (campaigns in API mode, quick replies). |
| **More** | Profile card. Grouped settings list (Work, Team, WhatsApp, Workspace) with icon wells. Sign out at bottom. |
| Reminders | Sections Overdue / Today / Upcoming / Done; rows with checkbox, contact, note, time, WhatsApp button. |
| Import | 3-step flow with progress header: Choose file → Map columns → Review & import. |
| Settings pages | Consistent grouped-list pages using the same row component. |
