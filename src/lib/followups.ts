/** Labels for follow-up sequences. */
import type { Sequence } from '@/services/crm/sequences';

type T = (k: string, o?: Record<string, unknown>) => string;

export const humanMinutes = (m: number, t: T) =>
  m === 0
    ? t('followup.immediately')
    : m % 43200 === 0
      ? t('followup.months', { count: m / 43200 })
      : m % 10080 === 0
        ? t('followup.weeks', { count: m / 10080 })
        : m % 1440 === 0
          ? t('followup.days', { count: m / 1440 })
          : m % 60 === 0
            ? t('followup.hours', { count: m / 60 })
            : t('followup.minutes', { count: m });

export const triggerLabel = (s: Pick<Sequence, 'trigger'>, t: T, serviceName?: (id: string) => string | undefined) =>
  s.trigger.kind === 'status'
    ? t('followup.trigger.statusIs', { status: t(`status.${s.trigger.status}`, { defaultValue: s.trigger.status }) })
    : s.trigger.kind === 'created'
      ? t('followup.trigger.created')
      : s.trigger.kind === 'service'
        ? t('services.triggerIs', { name: serviceName?.(s.trigger.serviceId) ?? '…' })
        : s.trigger.kind === 'visit'
          ? t('visits.trigger.afterVisit')
          : s.trigger.kind === 'milestone'
            ? t('visits.trigger.milestoneIs', { count: s.trigger.visits })
            : s.trigger.kind === 'occasion'
              ? t('visits.trigger.occasionIs', {
                  field: t(`visits.occasion.${s.trigger.field}`, { defaultValue: s.trigger.field }),
                  count: s.trigger.daysBefore,
                })
              : t('followup.trigger.manual');
