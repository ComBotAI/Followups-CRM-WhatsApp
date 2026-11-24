/**
 * Applies an industry template to the active workspace: the lead schema (guest
 * profile fields), the services, the extra guest fields, and the chosen
 * automations as follow-up series with their wording. Idempotent: anything
 * that already exists (same name) is kept, not duplicated, so running setup
 * again (or for a second industry) only adds what is missing.
 */
import { useAccountsStore } from '@/stores/accounts';
import { useAuthStore } from '@/stores/auth';
import { useVisitsStore } from '@/stores/visits';
import { whatsAppConfig } from '@/stores/whatsapp';
import { createUserField, ensureLeadSchema, listAllCustomFields, userFieldSlug } from '@/services/crm/schema';
import { listServices, saveService } from '@/services/crm/services';
import { listSequences, saveSequence, type SequenceStep, type SequenceTrigger } from '@/services/crm/sequences';
import type { Industry, IndustryRule } from './industries';

export type SetupChoice = {
  industry: Industry;
  business: string;
  reviewLink: string;
  /** Keys of the template's services to create. */
  services: string[];
  /** Keys of the template's rules to create; `recall:<serviceKey>` for a service's "due again" reminder. */
  rules: string[];
};

export type SetupReport = { services: number; fields: number; automations: number; skipped: string[] };

const uid = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const textStep = (wait: SequenceStep['wait'], text: string): SequenceStep => ({
  id: uid(),
  wait,
  kind: 'session',
  session: { type: 'text', text },
  templateId: '',
  templateName: '',
  language: '',
  mapping: {},
});

/** Points `[[lead_x_…]]` tokens at the slugs the fields actually got (a name may have been taken). */
const retoken = (text: string, slugs: Map<string, string>) => text.replace(/\[\[\s*(lead_x_[a-z0-9_]+)\s*\]\]/g, (all, key: string) => (slugs.has(key) ? `[[${slugs.get(key)}]]` : all));

export const applyIndustry = async (c: SetupChoice, onStep?: (label: string) => void): Promise<SetupReport> => {
  const report: SetupReport = { services: 0, fields: 0, automations: 0, skipped: [] };
  const myId = useAuthStore.getState().profile?.id ?? '';
  const acct = useAccountsStore.getState().activeId;

  // 1. The guest profile fields (visits, spend, tier, birthday…) on every contact.
  onStep?.('fields');
  await ensureLeadSchema().catch(() => undefined);

  // 2. Extra guest fields for this business.
  const existing = await listAllCustomFields().catch(() => []);
  const taken = new Set(existing.map((f) => f.slug));
  const byName = new Map(existing.map((f) => [(f.name ?? '').trim().toLowerCase(), f.slug]));
  const slugs = new Map<string, string>();
  for (const f of c.industry.fields) {
    // Tokens in the wording use the English name's slug, whatever language the field is named in.
    const expected = userFieldSlug(f.en ?? f.name, []);
    const have = byName.get(f.name.trim().toLowerCase()) ?? byName.get((f.en ?? '').trim().toLowerCase());
    if (have) {
      slugs.set(expected, have);
      continue;
    }
    try {
      const created = await createUserField({ name: f.name, type: f.type, options: f.options, taken });
      taken.add(created.slug);
      slugs.set(expected, created.slug);
      report.fields += 1;
    } catch {
      report.skipped.push(f.name);
    }
  }

  // 3. Services (what a visit can be).
  onStep?.('services');
  const current = await listServices().catch(() => []);
  const serviceIds = new Map<string, string>();
  let sort = current.length;
  for (const s of c.industry.services.filter((x) => c.services.includes(x.key))) {
    const same = current.find((x) => x.name.trim().toLowerCase() === s.name.toLowerCase());
    if (same) {
      serviceIds.set(s.key, same.id);
      continue;
    }
    const id = await saveService({ name: s.name, price: null, resets: [], remindDays: s.days, active: true, sort: sort++ });
    serviceIds.set(s.key, id);
    report.services += 1;
  }

  // 4. Automations, with their wording.
  onStep?.('automations');
  const series = await listSequences().catch(() => []);
  const haveSeries = new Set(series.map((x) => x.name.trim().toLowerCase()));
  const channelId = whatsAppConfig().channelId ?? '';
  const save = async (name: string, description: string, trigger: SequenceTrigger, steps: SequenceStep[]) => {
    if (haveSeries.has(name.toLowerCase())) return;
    await saveSequence({
      name,
      description,
      channelId,
      steps,
      keepIf: {},
      onFail: 'skip',
      trigger,
      active: true,
      createdBy: myId,
      repeat: null,
    });
    haveSeries.add(name.toLowerCase());
    report.automations += 1;
  };
  const triggerOf = (r: IndustryRule): SequenceTrigger | null => {
    if (r.trigger.kind !== 'occasion') return r.trigger;
    const f = r.trigger.field;
    if (typeof f === 'string') return { kind: 'occasion', field: f, daysBefore: r.trigger.daysBefore };
    const slug = slugs.get(userFieldSlug(f.userField, []));
    return slug ? { kind: 'occasion', field: slug, daysBefore: r.trigger.daysBefore } : null;
  };
  for (const r of c.industry.rules.filter((x) => c.rules.includes(x.key))) {
    const trigger = triggerOf(r);
    if (!trigger) {
      report.skipped.push(r.name);
      continue;
    }
    try {
      await save(
        r.name,
        r.description,
        trigger,
        r.steps.map((s) => textStep(s.wait, retoken(s.text, slugs))),
      );
    } catch {
      report.skipped.push(r.name);
    }
  }
  // A "due again" reminder for each chosen service customers come back for.
  if (c.industry.recall) {
    for (const s of c.industry.services.filter((x) => x.days && c.services.includes(x.key) && c.rules.includes(`recall:${x.key}`))) {
      const id = serviceIds.get(s.key);
      if (!id) continue;
      try {
        await save(
          c.industry.recallName?.(s.name) ?? `${s.name} reminder`,
          c.industry.recallDescription?.(s.name, s.days!) ?? `${s.days} days after each ${s.name.toLowerCase()}. Starts over at the next one.`,
          { kind: 'service', serviceId: id },
          [textStep({ value: s.days!, unit: 'days' }, retoken(c.industry.recall.replace(/\[\[service\]\]/g, s.name.toLowerCase()), slugs))],
        );
      } catch {
        report.skipped.push(`${s.name} reminder`);
      }
    }
  }

  // 5. The workspace remembers its industry and the details messages use.
  if (acct) useVisitsStore.getState().set(acct, { industry: c.industry.key, business: c.business.trim(), reviewLink: c.reviewLink.trim() });
  return report;
};
