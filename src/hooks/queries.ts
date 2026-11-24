/**
 * React Query hooks over the CRM. Keys are centralised so mutations can
 * invalidate precisely. Lists are cached to MMKV through the persister set up
 * in the root layout, so the app paints offline.
 */
import type { ContactTag, CustomField, Segment, Template } from '@ab-ecosystem/cpaas';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { buildContactFilter, type LeadFilter } from '@/lib/filters';
import { crm, crmFor } from '@/services/crm/client';
import { activeAccountId } from '@/stores/accounts';
import { createLead, getLead, toLead, updateLead, type Lead, type LeadInput } from '@/services/crm/leads';
import { dropdownOptions, F, LEAD_STATUSES, listAllCustomFields, CONTACT_TYPES } from '@/services/crm/schema';
import { fetchRemarks, localRemarks, localReminders, syncReminders, type Reminder } from '@/services/crm/records';
import { listTeammates, type Teammate } from '@/services/sso/client';
import { afterLeadChange, listContactSchedules, listSequences } from '@/services/crm/sequences';
import { listQuickReplies, type QuickReply } from '@/services/crm/quickReplies';
import { cachedServices, listServices } from '@/services/crm/services';
import { readJson, writeJson } from '@/services/storage';
import { cachedTemplates, fetchAndCacheTemplates, listWhatsAppChannels } from '@/services/crm/whatsapp';
import { useAuthStore, useMyId } from '@/stores/auth';
import { previewTeam } from '@/lib/previewClient';
import { isWebPreview } from '@/lib/webPreview';

export const keys = {
  leads: (f: LeadFilter) => ['leads', f] as const,
  lead: (id: string) => ['lead', id] as const,
  tags: ['tags'] as const,
  segments: ['segments'] as const,
  fields: ['fields'] as const,
  team: ['team'] as const,
  remarks: (id: string) => ['remarks', id] as const,
  reminders: ['reminders'] as const,
};

const PAGE = 50;

export const useLeads = (filter: LeadFilter, enabled = true) =>
  useInfiniteQuery({
    queryKey: keys.leads(filter),
    enabled,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      // The account this page is fetched for: the reply can land after a switch.
      const acct = activeAccountId();
      const { filter: cf } = buildContactFilter(filter);
      const res = await crmFor(acct).contacts.list({
        page: pageParam,
        rows: PAGE,
        search: filter.search?.trim() || undefined,
        segment: filter.segment || undefined,
        agent: filter.agent && filter.agent !== 'unassigned' ? filter.agent : undefined,
        filter: cf.conditions?.length ? cf : undefined,
      });
      const leads = res.data.map(toLead);
      return {
        leads,
        page: res.pagination.page,
        pages: res.pagination.pages,
        total: res.pagination.total,
      };
    },
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    staleTime: 30_000,
  });

/**
 * The loaded pages as one list, each contact once. Pages are read by number, so a contact
 * created or trashed between two page reads shifts the rest: one can then come back twice.
 */
export const flatLeads = (pages: { leads: Lead[] }[] | undefined): Lead[] => {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: Lead[] = [];
  for (const p of pages)
    for (const l of p.leads) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      out.push(l);
    }
  return out;
};

export const useLead = (id: string | undefined) =>
  useQuery({
    queryKey: keys.lead(id ?? ''),
    queryFn: () => getLead(id!),
    enabled: !!id,
    staleTime: 15_000,
  });

export const useTags = () =>
  useQuery({
    queryKey: keys.tags,
    queryFn: async () => {
      const out: ContactTag[] = [];
      let page = 1;
      for (;;) {
        const res = await crm().contactTags.list({ page, rows: 100 });
        out.push(...res.data);
        if (page >= res.pagination.pages) break;
        page += 1;
      }
      return out;
    },
    staleTime: 5 * 60_000,
  });

export const useSegments = () =>
  useQuery({
    queryKey: keys.segments,
    queryFn: async () => {
      const out: Segment[] = [];
      let page = 1;
      for (;;) {
        const res = await crm().segments.list({ page, rows: 100 });
        out.push(...res.data);
        if (page >= res.pagination.pages) break;
        page += 1;
      }
      return out;
    },
    staleTime: 5 * 60_000,
  });

export const useFields = () =>
  useQuery({
    queryKey: keys.fields,
    queryFn: () => listAllCustomFields(),
    staleTime: 10 * 60_000,
  });

/** Dropdown options for the lead schema, with sane fallbacks before the schema loads. */
export const useLeadOptions = () => {
  const fields = useFields();
  const by = (slug: string): CustomField | undefined => fields.data?.find((f) => f.slug === slug);
  return {
    statuses: dropdownOptions(by(F.status), LEAD_STATUSES),
    contactTypes: dropdownOptions(by(F.contactType), CONTACT_TYPES),
    isLoading: fields.isLoading,
    fields,
  };
};

export const useTeam = () => {
  const token = useAuthStore((s) => s.token);
  const isOwner = useAuthStore((s) => s.context?.isOwner ?? true);
  const profile = useAuthStore((s) => s.profile);
  return useQuery<Teammate[]>({
    queryKey: keys.team,
    queryFn: () =>
      isWebPreview()
        ? previewTeam().map((m) => ({
            id: m.id,
            userId: m.id,
            name: m.name,
            email: m.email,
            roleTitle: m.role,
            isOwner: m.id === 'preview',
            status: 'active',
            accessExpiry: null,
          }))
        : listTeammates(
            token!,
            isOwner,
            profile
              ? {
                  id: profile.id,
                  name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email,
                  email: profile.email,
                }
              : undefined,
          ),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });
};

export const useCreateLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LeadInput) => createLead(input),
    onSuccess: (lead) => {
      qc.setQueryData(keys.lead(lead.id), lead);
      // Lists and board columns show this lead.
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['board'] });
      void afterLeadChange(null, lead);
      // Created with a birthday / anniversary: its yearly wishes are armed now.
      if (lead.birthday || lead.anniversary) void import('@/services/crm/services').then((m) => m.armOccasions(lead)).catch(() => undefined);
    },
  });
};

export const useUpdateLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lead, input }: { lead: Lead; input: LeadInput }) => updateLead(lead, input),
    onSuccess: (lead, { lead: prev }) => {
      qc.setQueryData(keys.lead(lead.id), lead);
      // Lists and board columns show this lead.
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['board'] });
      void afterLeadChange(prev, lead).then((started) => {
        if (started.length) void qc.invalidateQueries({ queryKey: waKeys.schedules(lead.id) });
      });
      // A new or changed birthday / anniversary / date field: its yearly wishes are armed now, not at the next visit.
      const dates = (l: Lead) => [l.birthday, l.anniversary, ...Object.values(l.extra).filter((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))].join('|');
      if (dates(prev) !== dates(lead))
        void import('@/services/crm/services').then((m) => m.armOccasions(lead)).catch(() => undefined);
    },
  });
};

export const useRemarks = (contactId: string | undefined) =>
  useQuery({
    queryKey: keys.remarks(contactId ?? ''),
    queryFn: async () => {
      try {
        const remote = await fetchRemarks(contactId!);
        // Remarks still waiting to upload stay listed (the server doesn't have them yet).
        const pending = localRemarks(contactId!).filter((r) => !r.synced && !remote.some((x) => x.id === r.id));
        return [...pending, ...remote];
      } catch {
        return localRemarks(contactId!);
      }
    },
    enabled: !!contactId,
    placeholderData: () => (contactId ? localRemarks(contactId) : []),
  });

export const useReminders = () => {
  const memberId = useMyId();
  return useQuery<Reminder[]>({
    queryKey: keys.reminders,
    queryFn: () => syncReminders(memberId),
    placeholderData: localReminders,
    staleTime: 60_000,
  });
};

/* ------------------------------ WhatsApp API ------------------------------ */

export const waKeys = {
  channels: ['wa', 'channels'] as const,
  templates: (channelId: string) => ['wa', 'templates', channelId] as const,
  sequences: ['wa', 'sequences'] as const,
  schedules: (contactId: string) => ['wa', 'schedules', contactId] as const,
};

export const useWaChannels = (enabled = true) => useQuery({ queryKey: waKeys.channels, queryFn: listWhatsAppChannels, enabled, staleTime: 10 * 60_000 });

/**
 * A channel's templates, from the copy saved on the phone. The server is only
 * asked when nothing is saved yet, or when the user resyncs / pulls to refresh
 * (which invalidates this query). `status` filters the saved list locally.
 */
export const useTemplates = (channelId: string | null | undefined, status?: Template['status']) => {
  const qc = useQueryClient();
  const cache = channelId ? cachedTemplates(channelId) : null;
  return useQuery({
    queryKey: waKeys.templates(channelId ?? ''),
    // The first 300 show at once; later pages update the list as they arrive.
    queryFn: () => fetchAndCacheTemplates(channelId!, (all) => qc.setQueryData(waKeys.templates(channelId!), all)),
    enabled: !!channelId,
    initialData: cache?.templates,
    initialDataUpdatedAt: cache?.at,
    staleTime: Infinity,
    select: status ? (list: Template[]) => list.filter((t) => t.status === status) : undefined,
  });
};

/** When a channel's templates were last downloaded (0 = never). */
export const templatesUpdatedAt = (channelId: string) => cachedTemplates(channelId)?.at ?? 0;

export const useSequences = (enabled = true) => useQuery({ queryKey: waKeys.sequences, queryFn: () => listSequences(), enabled, staleTime: 5 * 60_000 });

export const useContactSchedules = (contactId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: waKeys.schedules(contactId ?? ''),
    queryFn: () => listContactSchedules(contactId!),
    enabled: !!contactId && enabled,
    staleTime: 30_000,
  });

/* ------------------------------ Quick replies ----------------------------- */

const QR_CACHE = 'quickreplies.cache.v1';

/** Quick replies, from the copy saved on the phone; refetched in the background at most every 10 minutes. */
export const useQuickReplies = () => {
  const cache = readJson<{ at: number; list: QuickReply[] }>(QR_CACHE);
  return useQuery({
    queryKey: ['quickReplies'],
    queryFn: async () => {
      const list = await listQuickReplies();
      writeJson(QR_CACHE, { at: Date.now(), list });
      return list;
    },
    initialData: cache?.list,
    initialDataUpdatedAt: cache?.at,
    staleTime: 10 * 60_000,
  });
};

/** The services catalogue (Settings → Services), from the phone's copy until loaded. */
export const useServices = () =>
  useQuery({
    queryKey: ['services'],
    queryFn: () => listServices(),
    placeholderData: () => cachedServices(),
    staleTime: 5 * 60_000,
  });
