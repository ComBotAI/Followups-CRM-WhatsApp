/**
 * Development only: a stand-in for the CPaaS client in web preview mode
 * (`?preview=1`), answering from a fixed sample workspace so every page can be
 * laid out against realistic data without a server.
 *
 * It covers what the screens read (contacts, fields, tags, the data store's
 * remarks / reminders, campaigns, templates, quick replies). Any
 * other call resolves to an empty page; writes resolve as if they worked.
 */
import type { CrmClient } from '@ab-ecosystem/cpaas';

import { collectionTitle, COLLECTIONS, STORE_TITLE, type CollectionKey } from '@/services/crm/datastore';
import { CONTACT_TYPES, F, LEAD_FIELDS, LEAD_STATUSES } from '@/services/crm/schema';
import { demo, demoUsesWhatsAppApp } from './previewDemo';
import { previewChannels } from './webPreview';

type Rec = Record<string, unknown>;

const now = Date.now();
const H = 3600_000;
const D = 24 * H;
const iso = (offset: number) => new Date(now + offset).toISOString();
/** A day relative to today, at a set local time (orders happen in opening hours). */
const atHour = (days: number, hour: number, minute: number) => {
  const d = new Date(now + days * 24 * 3600_000);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const page = <T>(all: T[], q: { page?: number; rows?: number } = {}) => {
  const rows = q.rows ?? 25;
  const p = q.page ?? 1;
  return { data: all.slice((p - 1) * rows, p * rows), pagination: { page: p, rows, total: all.length, pages: Math.max(1, Math.ceil(all.length / rows)) } };
};

/* --------------------------------- people -------------------------------- */

/** The sample team (the owner first). */
export const previewTeam = () => demo().team;

/**
 * Built on first use, not at import: this module sits in an import cycle with
 * `schema` and `datastore` (they reach the client, which reaches this), so
 * their constants may not exist yet while it loads.
 */
const build = () => {
  const d = demo();
  const PREVIEW_TEAM = d.team;
  const NAMES = d.names;
  const REMARKS = d.remarks;
  const SERVICES = (d.services ?? []).map(([name, price, days], i) => ({
    id: `svc${i + 1}`,
    name,
    price,
    remind_days: days,
    active: true,
    sort: i,
    resets: '',
  }));
  const contactAt = (i: number) => {
    const [first, last] = NAMES[i].split(' ');
    // A bakery's regulars have already ordered (Won); the rest are enquiries in progress.
    const status = SERVICES.length ? (i % 3 !== 2 ? 'Won' : ['New', 'Contacted', 'Interested', 'Follow-Up'][i % 4]) : LEAD_STATUSES[i % LEAD_STATUSES.length];
    const member = PREVIEW_TEAM[i % PREVIEW_TEAM.length];
    const followUp = i % 3 === 0 ? iso((i % 2 ? -1 : 1) * (2 + i) * H) : i % 3 === 1 ? iso((i + 1) * D) : '';
    const calls = (i * 7) % 9;
    return {
      id: i === 0 ? 'preview' : `c${i}`,
      name: { first_name: first, last_name: last },
      // 9 digits after +91, one short of a real Indian mobile number, so no sample number can belong to anyone.
      lead_source: { type: i % 4 === 0 ? 'import' : 'manual', module: 'followups', id: null },
      profile: { whatsapp: { identifier: `919${8 - (i % 3)}${String(((2345678 + i * 734053) % 8999999) + 1000000).slice(0, 7)}`, name: NAMES[i] } },
      agent: member.id,
      tags: [],
      chat_metadata: { unread: i % 5 === 0 ? (i % 3) + 1 : 0 },
      custom_field_hash: {
        [F.status]: status,
        [F.contactType]: SERVICES.length ? CONTACT_TYPES[i % 3 === 2 ? 0 : i === 23 ? 2 : 1] : CONTACT_TYPES[i % 7 === 0 ? 1 : i % 11 === 0 ? 2 : 0],
        [F.nextFollowUp]: followUp,
        [F.followUpNote]: followUp ? REMARKS[i % REMARKS.length] : '',
        [F.lastRemark]: calls ? REMARKS[(i + 2) % REMARKS.length] : '',
        [F.assignedName]: member.name,
        ...(d.board ? { [d.board.slug]: d.board.stages[i % d.board.stages.length] } : {}),
        // Customers who order regularly carry the services they take.
        ...(SERVICES.length && i % 3 !== 2
          ? {
              [F.services]: [SERVICES[i % 2].name],
              [F.lastVisit]: iso(-((i % 5) + 1) * 4 * D),
              [F.visitCount]: ((i * 5) % 11) + 2,
              [F.totalSpent]: (((i * 5) % 11) + 2) * (SERVICES[i % 2].price + 120),
            }
          : {}),
      },
      createdAt: iso(-(i + 2) * D),
      updatedAt: iso(-(i + 1) * H),
    };
  };

  const CONTACTS = NAMES.map((_, i) => contactAt(i));
  const contactName = (c: (typeof CONTACTS)[number]) => `${c.name.first_name} ${c.name.last_name}`;

  /* ------------------------------- data store ------------------------------ */

  const REMARK_ROWS: Rec[] = CONTACTS.slice(0, 10).flatMap((c, i) =>
    [0, 1].map((k) => ({
      id: `rm${i}-${k}`,
      contact_id: c.id,
      text: REMARKS[(i + k) % REMARKS.length],
      member_id: PREVIEW_TEAM[(i + k) % 4].id,
      member_name: PREVIEW_TEAM[(i + k) % 4].name,
      created_on: iso(-(i * 9 + k * 30) * H),
    })),
  );

  const REMINDER_ROWS: Rec[] = CONTACTS.slice(0, 12).map((c, i) => ({
    id: `rem${i}`,
    contact_id: c.id,
    contact_name: contactName(c),
    phone: c.profile.whatsapp.identifier,
    note: REMARKS[i % REMARKS.length],
    due_at: iso((i - 3) * 7 * H),
    member_id: PREVIEW_TEAM[i % 4].id,
    member_name: PREVIEW_TEAM[i % 4].name,
    done: i % 5 === 4,
    done_at: '',
  }));

  /* Services: each regular's orders, and the reorder reminder each one started. */
  const regulars = CONTACTS.filter((_, i) => i % 3 !== 2).slice(0, 10);
  const VISITS: Rec[] = SERVICES.length
    ? regulars.flatMap((c, i) =>
        [0, 1, 2].map((k) => {
          const svc = SERVICES[k === 1 && i % 2 ? 1 : 0];
          return {
            id: `v${i}-${k}`,
            contact_id: c.id,
            contact_name: contactName(c),
            service_ids: svc.id,
            service_names: svc.name,
            // Spread over the day like real orders (10 am – 8 pm).
            // The first few came in today (a live front desk); the rest over the past weeks.
            // Most of today's guests have been before; every other one is new.
            returning: !(k === 0 && i < 5 && i % 2 === 1),
            visited_at: k === 0 && i < 5 ? iso(-(i * 55 + 20) * 60_000) : atHour(-(k * 23 + (i % 5) + 2), 11 + ((i * 3 + k * 5) % 9), (i * 17 + k * 23) % 60),
            price: svc.price + ((i * 70) % 400),
            member_id: PREVIEW_TEAM[(i + k) % 4].id,
            member_name: PREVIEW_TEAM[(i + k) % 4].name,
            note: k === 0 ? REMARKS[i % REMARKS.length] : '',
          };
        }),
      )
    : [];
  const tplId = (name: string) =>
    `t${
      Math.max(
        0,
        d.templates.findIndex((x) => x.name === name),
      ) + 1
    }`;
  const SERIES = SERVICES.length ? (d.series ?? []) : [];
  const SEQUENCES: Rec[] = SERIES.map((x, n) => ({
    id: `seq${n + 1}`,
    name: x.name,
    description: x.description,
    channel_id: 'preview-wa',
    steps_json: JSON.stringify(
      x.steps.map(([days, tpl, text], k) => ({
        id: `s${k + 1}`,
        wait: days < 1 ? { value: Math.round(days * 24), unit: 'hours' } : days % 7 === 0 ? { value: days / 7, unit: 'weeks' } : { value: days, unit: 'days' },
        // Sent by hand with the WhatsApp app: a written message; with the API: an approved template.
        ...(demoUsesWhatsAppApp() && text ? { kind: 'session', session: { type: 'text', text } } : { kind: 'template' }),
        templateId: tplId(tpl),
        templateName: tpl,
        language: 'en',
        mapping: {},
      })),
    ),
    condition_json: '{}',
    on_fail: 'skip',
    trigger_json: JSON.stringify({ kind: 'service', serviceId: SERVICES[x.service]?.id ?? 'svc1' }),
    active: true,
    created_by: 'preview',
    repeat_json: '',
  }));
  const firstSeries = SERIES[0];
  const firstDue = firstSeries ? firstSeries.steps.reduce<number[]>((acc, [days]) => [...acc, (acc.at(-1) ?? 0) + days], []) : [];
  const RUNS: Rec[] = SEQUENCES.length
    ? regulars.map((c, i) => {
        // Visited long enough ago that their first message goes out in the next few days.
        const back = Math.max(1, (firstDue[0] ?? 7) - 1 - (i % 6));
        const visitAt = Date.parse(atHour(-back, 11 + ((i * 3) % 9), (i * 17) % 60));
        return {
          id: `run${i}`,
          contact_id: c.id,
          contact_name: contactName(c),
          service_id: 'svc1',
          service_name: SERVICES[0].name,
          sequence_id: 'seq1',
          sequence_name: firstSeries?.name ?? '',
          visit_id: `v${i}-0`,
          visit_at: new Date(visitAt).toISOString(),
          mode: 'api',
          series_id: `series${i}`,
          due_json: JSON.stringify(firstDue.map((days) => new Date(visitAt + days * D).toISOString())),
          next_due: new Date(visitAt + (firstDue[0] ?? 0) * D).toISOString(),
          status: 'active',
        };
      })
    : [];

  // WhatsApp app (no API): reorder reminders wait in "WhatsApp to send", already written.
  const byHand = demoUsesWhatsAppApp();
  const first = (c: (typeof CONTACTS)[number]) => c.name.first_name;
  const TASKS = d.taskTexts ?? [];
  const WA_TASKS: Rec[] =
    byHand && TASKS.length
      ? regulars.slice(0, 8).map((c, i) => ({
          id: `wt${i}`,
          contact_id: c.id,
          contact_name: contactName(c),
          name: contactName(c),
          phone: c.profile.whatsapp.identifier,
          sequence_id: 'seq1',
          sequence_name: TASKS[i % TASKS.length][0],
          step_index: i % 3 === 2 ? 1 : 0,
          text: TASKS[i % TASKS.length][1].replaceAll('{first}', first(c)),
          due_at: atHour(i < 2 ? -1 : 0, 10 + i, (i * 13) % 60),
          member_id: 'preview',
          status: 'pending',
          done_at: '',
          conditions_json: '[]',
          on_fail: 'skip',
          run_id: `run${i}`,
        }))
      : [];
  if (byHand) for (const r of RUNS) r.mode = 'app';

  const RECORDS: Partial<Record<string, Rec[]>> = {
    [COLLECTIONS.waTasks]: WA_TASKS,
    [COLLECTIONS.remarks]: REMARK_ROWS,
    [COLLECTIONS.reminders]: REMINDER_ROWS,
    [COLLECTIONS.services]: SERVICES,
    [COLLECTIONS.serviceVisits]: VISITS,
    [COLLECTIONS.serviceRuns]: RUNS,
    [COLLECTIONS.sequences]: SEQUENCES,
  };

  /** Equality and `$in` / `$gte` / `$lte` on the record's own fields: enough for the screens' filters. */
  const matches = (r: Rec, filter: Rec | undefined): boolean =>
    !filter ||
    Object.entries(filter).every(([k, cond]) => {
      const v = r[k];
      if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
        const c = cond as Rec;
        if ('$in' in c) return (c.$in as unknown[]).includes(v);
        if ('$gte' in c && String(v) < String(c.$gte)) return false;
        if ('$lte' in c && String(v) > String(c.$lte)) return false;
        return true;
      }
      return v === cond;
    });

  const search = (collectionId: string, q: { filter?: Rec; sort?: string; order?: string; page?: number; rows?: number } = {}) => {
    let rows = (RECORDS[collectionId] ?? []).filter((r) => matches(r, q.filter));
    if (q.sort) {
      const k = q.sort;
      rows = [...rows].sort((a, b) => String(a[k]).localeCompare(String(b[k])) * (q.order === 'desc' ? -1 : 1));
    }
    return page(rows, q);
  };

  /* ------------------------------- campaigns -------------------------------- */

  const CAMPAIGNS = d.campaigns.map((c, i) => ({
    id: `cmp${i + 1}`,
    name: c.name,
    status: c.status,
    receivers: c.receivers,
    totalMessages: c.sent,
    createdAt: iso(-Math.abs(c.hoursAgo) * H - H),
    scheduledAt: iso(-c.hoursAgo * H),
    ...(c.error ? { error: c.error } : {}),
  }));
  const CAMPAIGN_ROWS = CAMPAIGNS.map((c) => ({
    ...c,
    type: 'broadcast',
    campaignType: 'whatsapp',
    channelType: 'whatsapp',
    messages: [],
    filters: [],
    isRepeating: false,
    hidden: false,
    updatedAt: c.createdAt,
  }));

  const TEMPLATES = d.templates
    .map((tpl, i) => ({ id: `t${i + 1}`, ...tpl }))
    .map((tpl) => ({
      ...tpl,
      channelId: 'preview-wa',
      type: 'whatsapp',
      language: 'en',
      hash: `${tpl.name}:en`,
      components: [{ type: 'BODY', text: tpl.body }],
      createdAt: iso(-20 * D),
      updatedAt: iso(-2 * D),
    }));

  const QUICK_REPLIES = d.quickReplies.map((q, i) => ({ id: `q${i + 1}`, ...q }));

  /* --------------------------------- client --------------------------------- */

  /** The dropdown conditions a board or filter sends ("field equal to value"), ANDed; others are ignored. */
  type Cond = { field_id?: string; field_type?: string; condition?: string; value?: unknown };
  const fits = (c: (typeof CONTACTS)[number], conds: Cond[] | undefined) =>
    (conds ?? []).every(
      (x) =>
        x.field_type !== 'dropdown' || x.condition !== 'equal to' || String((c.custom_field_hash as Rec)[String(x.field_id)] ?? '') === String(x.value ?? ''),
    );
  const contactsApi = {
    list: async (q: { search?: string; page?: number; rows?: number; filter?: { conditions?: Cond[] } } = {}) => {
      const s = (q.search ?? '').toLowerCase().replace(/\s+/g, '');
      const all = (
        s ? CONTACTS.filter((c) => contactName(c).toLowerCase().replace(/\s+/g, '').includes(s) || c.profile.whatsapp.identifier.includes(s)) : CONTACTS
      ).filter((c) => fits(c, q.filter?.conditions));
      return page(all, q);
    },
    get: async (id: string) => CONTACTS.find((c) => c.id === id) ?? CONTACTS[0],
    iterate: async function* () {
      for (const c of CONTACTS) yield c;
    },
  };

  const opts = (values: readonly string[]) => ({ options: values.map((value) => ({ label: value, value })) });
  const fields = [
    ...LEAD_FIELDS.map((f) => ({
      ...f,
      id: f.slug,
      type: f.dataType,
      // The sample business's own services as the dropdown options.
      ...(f.slug === F.services && SERVICES.length ? { props: opts(SERVICES.map((x) => x.name)) } : {}),
    })),
    ...(d.board ? [{ id: d.board.slug, slug: d.board.slug, name: d.board.name, dataType: 'dropdown', type: 'dropdown', props: opts(d.board.stages) }] : []),
  ];

  const fixed: Rec = {
    contacts: contactsApi,
    customFields: { list: async (q?: Rec) => page(fields, { rows: 100, ...(q ?? {}) }) },
    contactTags: { list: async () => page(d.tags) },
    dataStores: { list: async () => page([{ id: 'store', title: STORE_TITLE }]), regions: async () => ({ data: [] }) },
    dataStoreCollections: {
      list: async () =>
        page(
          (Object.keys(COLLECTIONS) as CollectionKey[]).map((k) => ({ id: COLLECTIONS[k], title: collectionTitle(k), fields: [] })),
          { rows: 100 },
        ),
    },
    dataStoreRecords: {
      search: async (_store: string, collectionId: string, q?: Rec) => search(collectionId, q),
      list: async (_store: string, collectionId: string, q?: Rec) => search(collectionId, q),
      // Kept in memory for the session, so editors (e.g. a role's app permissions) save.
      insert: async (_store: string, collectionId: string, body: { record: Rec }) => {
        const id = `rec${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        (RECORDS[collectionId] ??= []).push({ ...body.record, id });
        return { ids: [id] };
      },
      update: async (_store: string, collectionId: string, id: string, body: { record: Rec }) => {
        const rows = RECORDS[collectionId] ?? [];
        const i = rows.findIndex((r) => r.id === id);
        if (i >= 0) rows[i] = { ...rows[i], ...body.record };
        return {};
      },
      remove: async (_store: string, collectionId: string, id: string) => {
        RECORDS[collectionId] = (RECORDS[collectionId] ?? []).filter((r) => r.id !== id);
        return {};
      },
    },
    notifications: { devices: async () => page([]) },
    campaignMessages: {
      stats: async () =>
        SERVICES.length
          ? { total: 640, sent: 632, delivered: 618, read: 497, replied: 118, failed: 8 }
          : { total: 420, sent: 412, delivered: 398, read: 301, replied: 64, failed: 8 },
      replies: async () => ({ groups: [] }),
      // A sample of who received the campaign, with what happened.
      list: async (_id: string, q?: { status?: string; exact?: boolean; page?: number; rows?: number }) => {
        const statuses = ['replied', 'read', 'read', 'delivered', 'read', 'replied', 'delivered', 'read', 'failed', 'read'];
        const replies = ['Booking 2 hampers 🪔', '', '', '', '', 'Is the dry-fruit one available?', '', '', '', ''];
        const rows = CONTACTS.slice(0, 20).map((c, i) => ({
          id: `cm${i}`,
          identifier: c.profile.whatsapp.identifier,
          name: contactName(c),
          status: statuses[i % statuses.length],
          reply: replies[i % replies.length],
          error: statuses[i % statuses.length] === 'failed' ? 'Number not on WhatsApp' : '',
        }));
        // "sent" without `exact` means reached at least that far (sent → delivered → read → replied).
        const level = ['sent', 'delivered', 'read', 'replied'];
        const reached = (r: { status: string }) =>
          !q?.status ||
          (q.exact || q.status === 'failed' ? r.status === q.status : r.status !== 'failed' && level.indexOf(r.status) >= level.indexOf(q.status));
        return page(rows.filter(reached), q);
      },
    },
    campaigns: { list: async (q?: Rec) => page(CAMPAIGN_ROWS, q), get: async (id: string) => CAMPAIGN_ROWS.find((c) => c.id === id) ?? CAMPAIGN_ROWS[0] },
    templates: { list: async (_channel: string, q?: Rec) => page(TEMPLATES, q) },
    cannedReplies: { list: async (q?: Rec) => page(QUICK_REPLIES, q) },
    channelOnboarding: {
      types: async () => ({ data: [{ type: 'whatsapp', label: 'WhatsApp', slug: 'preview', limit: 3, used: 2, remaining: 1 }] }),
      url: async () => ({ data: { url: 'about:blank' } }),
    },
    channels: {
      list: async (q?: Rec) =>
        page(
          previewChannels().filter((c) => !q?.type || c.meta.category === q.type),
          q,
        ),
      get: async (id: string) => ({ data: previewChannels().find((c) => c.id === id) ?? {} }),
    },
  };
  return { CONTACTS, contactName, fixed };
};
let built: ReturnType<typeof build> | null = null;
const sample = () => (built ??= build());

const ok = async (..._args: unknown[]) => ({ data: {}, success: true, id: `new-${Date.now()}`, ids: [`new-${Date.now()}`] });
const emptyList = async () => page([]);

/** Unlisted list-like reads answer an empty page; everything else succeeds. */
const resource = (name: string) =>
  new Proxy((sample().fixed[name] ?? {}) as Rec, {
    get: (target, method: string) => target[method] ?? (/^(list|search|stats|replies|iterate)/.test(method) ? emptyList : ok),
  });

export const previewClient = (): CrmClient => new Proxy({} as Rec, { get: (_t, name: string) => resource(name) }) as unknown as CrmClient;
