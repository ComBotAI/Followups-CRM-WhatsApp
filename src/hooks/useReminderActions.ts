/**
 * Tick a reminder done (or open again), snooze it and delete one, from any
 * screen. The list updates from the phone's copy at once; the server sync
 * follows in the background, without refetching every list.
 */
import { useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { keys } from '@/hooks/queries';
import { confirmAction } from '@/lib/dialog';
import type { Lead } from '@/services/crm/leads';
import { localReminders, type Reminder } from '@/services/crm/records';
import { removeReminder, rescheduleReminder, toggleReminderDone } from '@/services/reminders';

/** Shows the phone's reminders now; no refetch (the upload is on its way and a sync would only repeat it). */
export const showLocalReminders = (qc: QueryClient) => qc.setQueryData(keys.reminders, localReminders());

type LeadsPage = { leads: Lead[] };

/**
 * A lead's follow-up moved: its page and the loaded lists show the new copy at
 * once. The lists are only marked stale (their next visit refetches them, since
 * a due-date filter may now leave it out), and Today is rebuilt.
 */
export const applyLeadChange = (qc: QueryClient, lead: Lead) => {
  qc.setQueryData(keys.lead(lead.id), lead);
  qc.setQueriesData<InfiniteData<LeadsPage>>({ queryKey: ['leads'] }, (data) =>
    data?.pages
      ? { ...data, pages: data.pages.map((p) => (p?.leads ? { ...p, leads: p.leads.map((l) => (l.id === lead.id ? lead : l)) } : p)) }
      : data,
  );
  void qc.invalidateQueries({ queryKey: ['leads'], refetchType: 'none' });
  void qc.invalidateQueries({ queryKey: ['today'] });
};

// One action per reminder at a time: a double tap must not arm two alarms (one would be orphaned).
const busy = new Set<string>();
const once = async (id: string, fn: () => Promise<void>) => {
  if (busy.has(id)) return;
  busy.add(id);
  try {
    await fn();
  } finally {
    busy.delete(id);
  }
};

export const useReminderActions = () => {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const leadChanged = (lead: Lead) => applyLeadChange(qc, lead);
  return {
    toggle: (r: Reminder) =>
      once(r.id, async () => {
        await toggleReminderDone(r, leadChanged);
        showLocalReminders(qc);
      }),
    snooze: (r: Reminder, due: Date) =>
      once(r.id, async () => {
        await rescheduleReminder(r, due, leadChanged);
        showLocalReminders(qc);
      }),
    remove: async (r: Reminder) => {
      const ok = await confirmAction({
        title: t('reminders.deleteTitle'),
        message: r.note,
        confirmText: t('common.delete'),
        cancelText: t('common.cancel'),
        destructive: true,
      });
      if (!ok) return;
      await once(r.id, async () => {
        await removeReminder(r, leadChanged);
        showLocalReminders(qc);
      });
    },
  };
};
