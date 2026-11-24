/** Create or edit a lead. `?id=` edits; `?phone=` prefills a new one. */
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { confirmAction, showAlert } from '@/lib/dialog';
import { Button, Card, Chip, EmptyState, Input, Loading, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { useCreateLead, useLead, useLeadOptions, useServices, useTags, useUpdateLead } from '@/hooks/queries';
import { recordVisit } from '@/services/crm/services';
import { ServedByPicker, type ServedBy } from '@/components/visits/ServedBy';
import { parseDay, showDay } from '@/lib/day';
import { parseAmount } from '@/lib/money';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { CrmApiError, describeCrmError } from '@/services/crm/client';
import { findLeadByPhone, type Lead, type LeadInput } from '@/services/crm/leads';
import { DEFAULT_CONTACT_TYPE, dropdownOptions, isUserField, type LeadStatus } from '@/services/crm/schema';
import { useTheme } from '@/theme/ThemeProvider';
import type { CustomField } from '@ab-ecosystem/cpaas';
import { useFeatures } from '@/stores/features';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';
import { useCan } from '@/stores/auth';

function LeadFormScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string; phone?: string }>();
  const editing = !!params.id;
  const existing = useLead(params.id);
  if (editing && !existing.data) {
    return (
      <Screen title={t('leads.editLead')} back>
        {/* Deleted, trashed or not visible to this role: say so instead of loading forever. */}
        {existing.isError || !existing.isFetching ? <EmptyState title={t('leads.notFound')} /> : <Loading label={t('common.loading')} />}
      </Screen>
    );
  }
  // Keyed on the lead only: a background refetch (a teammate's edit) must not wipe what is being typed.
  return <LeadForm key={existing.data?.id ?? 'new'} lead={existing.data ?? null} phone={params.phone} />;
}

const seed = (lead: Lead | null, phone?: string): LeadInput =>
  lead
    ? {
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: lead.phone,
        status: lead.status || 'New',
        contactType: lead.contactType || DEFAULT_CONTACT_TYPE,
        services: lead.services,
        tags: lead.tags.map((tg) => tg.id),
        extra: { ...lead.extra },
        birthday: lead.birthday,
        anniversary: lead.anniversary,
      }
    : { phone: phone ?? '', status: 'New', contactType: DEFAULT_CONTACT_TYPE, tags: [], extra: {} };

const blank = (v: unknown) => v == null || v === '';
const same = (a: unknown, b: unknown) => (blank(a) && blank(b)) || JSON.stringify(a) === JSON.stringify(b);

/**
 * Only what the user changed. Sending the whole form would write back the values as they were
 * when it opened, undoing what a teammate, a visit or an automation changed meanwhile. Tags go
 * as additions / removals, applied to the contact's tags as stored now.
 */
const changedOnly = (next: LeadInput, before: LeadInput): LeadInput => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) {
    if (k === 'tags' || k === 'extra' || k === 'phone') continue;
    if (!same(v, before[k as keyof LeadInput])) out[k] = v;
  }
  const extra = Object.fromEntries(Object.entries(next.extra ?? {}).filter(([k, v]) => !same(v, before.extra?.[k])));
  if (Object.keys(extra).length) out.extra = extra;
  const had = before.tags ?? [];
  const now = next.tags ?? [];
  const addTags = now.filter((id) => !had.includes(id));
  const removeTags = had.filter((id) => !now.includes(id));
  if (addTags.length) out.addTags = addTags;
  if (removeTags.length) out.removeTags = removeTags;
  return out as LeadInput;
};

function LeadForm({ lead, phone }: { lead: Lead | null; phone?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const editing = !!lead;
  const options = useLeadOptions();
  const tags = useTags();
  const userFields = (options.fields.data ?? []).filter((f) => isUserField(f.slug));
  const create = useCreateLead();
  const update = useUpdateLead();
  const [form, setForm] = useState<LeadInput>(() => seed(lead, phone));
  const [dates, setDates] = useState(() => ({ birthday: showDay(lead?.birthday ?? ''), anniversary: showDay(lead?.anniversary ?? '') }));
  const set = <K extends keyof LeadInput>(k: K, v: LeadInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const services = useServices();
  const features = useFeatures();
  const canVisit = useCan(P.app.visits);
  const catalogue = (services.data ?? []).filter((s) => s.active);
  // New contact: services taken today (a visit, which starts their reminders) and the amount.
  const [visitIds, setVisitIds] = useState<string[]>([]);
  const [visitPrice, setVisitPrice] = useState('');
  const [servedBy, setServedBy] = useState<ServedBy>(null);
  const [recording, setRecording] = useState(false);
  const busy = create.isPending || update.isPending || recording;
  // The extras (tags, dates, the account's own fields) stay folded unless this contact already has some.
  const [more, setMore] = useState(
    () => !!lead && (!!lead.birthday || !!lead.anniversary || lead.tags.length > 0 || Object.values(lead.extra).some((v) => v != null && v !== '')),
  );
  const numericSlugs = new Set(
    userFields.filter((f) => f.dataType === 'number' || f.dataType === 'decimal' || f.dataType === 'amount' || f.dataType === 'percent').map((f) => f.slug),
  );
  const finalForm = (): LeadInput => {
    const extra = Object.fromEntries(
      Object.entries(form.extra ?? {}).map(([k, v]) => [
        k,
        numericSlugs.has(k) && typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v,
      ]),
    );
    return { ...form, extra };
  };

  const save = async () => {
    if (!editing && !normalizePhone(form.phone ?? '')) return showAlert(t('leads.phoneNeeded'), t('leads.phoneNeededBody'));
    const birthday = dates.birthday.trim() ? parseDay(dates.birthday) : '';
    const anniversary = dates.anniversary.trim() ? parseDay(dates.anniversary) : '';
    if ((dates.birthday.trim() && !birthday) || (dates.anniversary.trim() && !anniversary)) return showAlert(t('visits.badBirthday'));
    const withDates = (input: LeadInput): LeadInput => ({ ...input, birthday, anniversary });
    if (!editing && !form.firstName?.trim() && !form.lastName?.trim()) return showAlert(t('leads.nameNeeded'), t('leads.nameNeededBody'));
    try {
      if (lead) {
        const input = changedOnly(withDates(finalForm()), seed(lead));
        if (Object.keys(input).length) await update.mutateAsync({ lead, input });
        goBack();
      } else {
        const created = await create.mutateAsync(withDates(finalForm()));
        if (visitIds.length) {
          setRecording(true);
          const amount = visitPrice.trim() ? parseAmount(visitPrice) : null;
          await recordVisit(created, { serviceIds: visitIds, price: Number.isFinite(amount) ? amount : null, servedBy })
            .then((r) => (r.failed.length ? showAlert(t('services.someFailed', { names: r.failed.join(', ') })) : undefined))
            .catch((e: unknown) => showAlert(t('services.recordFailed'), describeCrmError(e)))
            .finally(() => setRecording(false));
        }
        router.replace({ pathname: '/lead/[id]', params: { id: created.id } });
      }
    } catch (err) {
      // The number is already a contact: offer it instead of a dead end.
      if (!lead && err instanceof CrmApiError && err.status === 409) {
        const existing = await findLeadByPhone(form.phone ?? '').catch(() => null);
        if (existing) {
          const open = await confirmAction({
            title: t('leads.duplicateTitle', { defaultValue: 'Already a contact' }),
            message: t('leads.duplicateBody', {
              defaultValue: '{{phone}} is already saved as {{name}}.',
              phone: formatPhone(existing.phone),
              name: existing.name,
            }),
            confirmText: t('leads.openExisting', { defaultValue: 'Open contact' }),
            cancelText: t('common.cancel'),
          });
          if (open) router.replace({ pathname: '/lead/[id]', params: { id: existing.id } });
          return;
        }
      }
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    }
  };

  return (
    <Screen
      title={editing ? t('leads.editLead') : t('leads.newLead')}
      back
      scroll
      footer={<Button title={editing ? t('leads.saveChanges') : t('leads.addLead')} size="lg" full onPress={() => void save()} loading={busy} />}
    >
      <View style={{ gap: 18, paddingTop: 4 }}>
        <FormSection title={t('leads.sectionContact')}>
          <Row gap={10}>
            <View style={{ flex: 1 }}>
              <Input
                label={t('auth.firstName')}
                value={form.firstName ?? ''}
                onChangeText={(v) => set('firstName', v)}
                autoCapitalize="words"
                autoFocus={!editing}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('auth.lastName')} value={form.lastName ?? ''} onChangeText={(v) => set('lastName', v)} autoCapitalize="words" />
            </View>
          </Row>
          <PhoneInput
            label={t('auth.mobile')}
            value={form.phone ?? ''}
            onChange={(v) => set('phone', v)}
            editable={!editing}
            hint={editing ? t('leads.phoneLocked', { phone: formatPhone(form.phone ?? '') }) : undefined}
          />
          <Field label={t('common.status')}>
            {options.statuses.map((s) => (
              <Chip key={s} label={t(`status.${s}`, { defaultValue: s })} selected={form.status === s} onPress={() => set('status', s as LeadStatus)} />
            ))}
          </Field>
          <Field label={t('leads.contactType')}>
            {options.contactTypes.map((ct) => (
              <Chip key={ct} label={t(`contactType.${ct}`, { defaultValue: ct })} selected={form.contactType === ct} onPress={() => set('contactType', ct)} />
            ))}
          </Field>
        </FormSection>
        {features.services && canVisit && catalogue.length ? (
          <FormSection title={t('services.title')}>
            <Field label={editing ? t('services.taken') : t('services.takenToday')}>
              {catalogue.map((s) =>
                editing ? (
                  <Chip
                    key={s.id}
                    label={s.name}
                    selected={(form.services ?? []).includes(s.name)}
                    onPress={() => {
                      const cur = form.services ?? [];
                      set('services', cur.includes(s.name) ? cur.filter((x) => x !== s.name) : [...cur, s.name]);
                    }}
                  />
                ) : (
                  <Chip
                    key={s.id}
                    label={s.name}
                    selected={visitIds.includes(s.id)}
                    onPress={() => {
                      const next = visitIds.includes(s.id) ? visitIds.filter((x) => x !== s.id) : [...visitIds, s.id];
                      setVisitIds(next);
                      const sum = catalogue.filter((x) => next.includes(x.id)).reduce((n, x) => n + (x.price ?? 0), 0);
                      setVisitPrice(sum ? String(sum) : '');
                    }}
                  />
                ),
              )}
            </Field>
            {!editing && visitIds.length ? (
              <>
                <ServedByPicker value={servedBy} onChange={setServedBy} />
                <Input
                  label={t('services.amount')}
                  value={visitPrice}
                  onChangeText={setVisitPrice}
                  keyboardType="decimal-pad"
                  placeholder={t('services.optional')}
                />
                <Text variant="micro" tone="faint">
                  {t('services.newContactHint')}
                </Text>
              </>
            ) : null}
          </FormSection>
        ) : null}

        <Pressable
          onPress={() => setMore((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: more }}
          hitSlop={6}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{t('leads.sectionMore')}</Text>
            <Text variant="caption" tone="muted">
              {t('leads.moreDetailsHint')}
            </Text>
          </View>
          {more ? <ChevronUp size={20} color={colors.textMuted} /> : <ChevronDown size={20} color={colors.textMuted} />}
        </Pressable>
        {more ? (
          <Card style={{ gap: 14 }}>
            {tags.data?.length ? (
              <Field label={t('leads.tags')}>
                {tags.data.map((tg) => (
                  <Chip
                    key={tg.id}
                    label={tg.name}
                    color={tg.color || undefined}
                    selected={form.tags?.includes(tg.id)}
                    onPress={() => set('tags', form.tags?.includes(tg.id) ? form.tags.filter((x) => x !== tg.id) : [...(form.tags ?? []), tg.id])}
                  />
                ))}
              </Field>
            ) : null}
            {/* Typed as DD/MM/YYYY; birthday and anniversary wishes go out from these. */}
            <Row gap={12}>
              <View style={{ flex: 1 }}>
                <Input label={t('visits.field.birthday')} value={dates.birthday} onChangeText={(v) => setDates((d) => ({ ...d, birthday: v }))} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label={t('visits.field.anniversary')} value={dates.anniversary} onChangeText={(v) => setDates((d) => ({ ...d, anniversary: v }))} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" />
              </View>
            </Row>
            {userFields.map((f) => (
              <ExtraField key={f.slug} field={f} value={form.extra?.[f.slug]} onChange={(v) => set('extra', { ...(form.extra ?? {}), [f.slug]: v })} />
            ))}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <SectionHeader title={title} style={{ paddingHorizontal: 4 }} />
      <Card style={{ gap: 14 }}>{children}</Card>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {children}
      </Row>
    </View>
  );
}

/** Input for a user-defined field, by its type. */
function ExtraField({ field, value, onChange }: { field: CustomField; value: unknown; onChange: (v: unknown) => void }) {
  const label = field.name ?? field.slug;
  const str = value == null ? '' : String(value);
  if (field.dataType === 'dropdown') {
    return (
      <Field label={label}>
        {dropdownOptions(field).map((o) => (
          <Chip key={o} label={o} selected={str === o} onPress={() => onChange(str === o ? '' : o)} />
        ))}
      </Field>
    );
  }
  const numeric = field.dataType === 'number' || field.dataType === 'amount' || field.dataType === 'decimal';
  return (
    <Input
      label={label}
      value={str}
      multiline={field.dataType === 'textarea'}
      placeholder={field.dataType === 'date' ? 'YYYY-MM-DD' : undefined}
      keyboardType={
        numeric
          ? 'decimal-pad'
          : field.dataType === 'phone'
            ? 'phone-pad'
            : field.dataType === 'email'
              ? 'email-address'
              : field.dataType === 'url'
                ? 'url'
                : 'default'
      }
      autoCapitalize={field.dataType === 'email' || field.dataType === 'url' ? 'none' : 'sentences'}
      // Numbers stay text while typing ("12." or "0.5" must survive); the form converts them on save.
      onChangeText={(v) => onChange(numeric ? v.replace(/[^\d.]/g, '') : v)}
    />
  );
}

/** New contact needs CREATE, editing one UPDATE: a member without it gets a short explanation instead. */
export default function LeadFormScreenGate() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <RequireCan any={[id ? P.contacts.update : P.contacts.create]}>
      <LeadFormScreen />
    </RequireCan>
  );
}
