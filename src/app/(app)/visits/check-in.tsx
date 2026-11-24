/**
 * Check in: record a visit in seconds, at the counter or the table.
 *
 * One field finds the guest by name or number: pick them from the matches (or
 * a full number finds them directly), or add a new guest with what was typed
 * (name, number, and a birthday where the business uses birthdays). Anyone
 * checked in becomes a Customer. Tap what the visit was, optionally the bill and party size, and
 * check in. The visit updates the guest's profile and starts the messages
 * that bring them back. Then straight on to the next guest.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CheckCircle2, MessageCircle, Minus, Plus, UserPlus, UserRound, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { RequireCan } from '@/components/RequireCan';
import { Avatar, Button, Chip, Input, Row, Screen, SearchField, StatusPill, Text } from '@/components/ui';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { useServices } from '@/hooks/queries';
import { messageOnWhatsApp } from '@/lib/actions';
import { showAlert } from '@/lib/dialog';
import { parseDay } from '@/lib/day';
import { parseAmount } from '@/lib/money';
import { P } from '@/lib/permissions';
import { formatPhone, isCompletePhone, normalizePhone } from '@/lib/phone';
import { fromNow } from '@/lib/time';
import { describeCrmError } from '@/services/crm/client';
import { createLead, findLeadByPhone, searchLeads, type Lead } from '@/services/crm/leads';
import { recordVisit } from '@/services/crm/services';
import { CUSTOMER_TYPE } from '@/services/crm/schema';
import { industryOf } from '@/services/visits/industries';
import { useTierColor } from '@/components/visits/tier';
import { ServedByPicker, type ServedBy } from '@/components/visits/ServedBy';
import { openContact } from '@/stores/contactPanel';
import { useVisitsConfig } from '@/stores/visits';
import { useAccountsStore } from '@/stores/accounts';
import { useTheme } from '@/theme/ThemeProvider';

function CheckIn() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const qc = useQueryClient();
  const config = useVisitsConfig();
  const industry = industryOf(config.industry);
  const services = useServices();
  const tierColor = useTierColor();
  const active = (services.data ?? []).filter((s) => s.active);

  // Who: a search (name or number), the guest picked from it, or a new guest being added.
  const [query, setQuery] = useState('');
  const [picked1, setPicked1] = useState<Lead | null>(null);
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [party, setParty] = useState(1);
  // Party size is only recorded once someone sets it.
  const [partyTouched, setPartyTouched] = useState(false);
  const [note, setNote] = useState('');
  // Back to "Me" for every guest: a front desk picks who served each one.
  const [servedBy, setServedBy] = useState<ServedBy>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ lead: Lead; visits: number } | null>(null);
  // Remounts the fields for the next guest.
  const [round, setRound] = useState(0);

  const q = query.trim();
  // Something that looks like a number is looked up as one once complete; anything else searches names.
  const numberish = /^[+\d][\d\s()+-]*$/.test(q);
  const typedNumber = numberish && isCompletePhone(q) ? normalizePhone(q) : '';
  const exact = useQuery({
    queryKey: ['visits', 'guest', typedNumber],
    queryFn: () => findLeadByPhone(typedNumber),
    enabled: !!typedNumber && !picked1 && !adding,
    staleTime: 30_000,
  });
  const matches = useQuery({
    queryKey: ['visits', 'search', q],
    queryFn: () => searchLeads(q),
    enabled: q.length >= 2 && !typedNumber && !picked1 && !adding,
    staleTime: 30_000,
  });
  const known = picked1 ?? (adding ? null : (exact.data ?? null));
  // A full number nobody has: straight to adding them.
  const newByNumber = !!typedNumber && exact.isSuccess && !exact.data;
  const isNew = adding || (newByNumber && !picked1);
  const digits = known ? known.phone : isNew ? (adding ? (isCompletePhone(phone) ? normalizePhone(phone) : '') : typedNumber) : '';
  const startNew = () => {
    setAdding(true);
    if (numberish) setPhone(q);
    else setName(q);
  };
  const clearGuest = () => {
    setPicked1(null);
    setAdding(false);
    setPhone('');
    setName('');
    // A birthday typed for a new guest must never land on someone picked next.
    setBirthday('');
    setQuery('');
    setRound((n) => n + 1);
  };
  // One visit type: chosen for you.
  const chosen = picked.length ? picked : active.length === 1 ? [active[0].id] : [];

  const reset = () => {
    setQuery('');
    setPicked1(null);
    setAdding(false);
    setPhone('');
    setName('');
    setBirthday('');
    setPicked([]);
    setAmount('');
    setParty(1);
    setPartyTouched(false);
    setNote('');
    setServedBy(null);
    setDone(null);
    setRound((n) => n + 1);
  };

  // A guest already on file can be checked in without a number; a new one needs it.
  const canSubmit = !!known || !!digits;
  const submit = async () => {
    if (!canSubmit) return showAlert(t('visits.needPhone'));
    if (!chosen.length) return showAlert(t('visits.needType'));
    const day = birthday ? parseDay(birthday) : '';
    if (birthday && !day) return showAlert(t('visits.badBirthday'));
    setSaving(true);
    // One account for the whole check-in (the guest and the visit), whatever happens meanwhile.
    const acct = useAccountsStore.getState().activeId;
    try {
      // Added by name with a number someone already has: that is them, not a new contact.
      const existing = known ?? (digits ? await findLeadByPhone(digits, acct).catch(() => null) : null);
      // No name typed: the number stands in for it, so the guest never shows as a blank.
      const typedName = name.trim() || formatPhone(digits);
      const lead =
        existing ??
        (await createLead(
          {
            firstName: name.trim() ? (typedName.split(' ')[0] ?? '') : typedName,
            lastName: name.trim() ? typedName.split(' ').slice(1).join(' ') : '',
            phone: digits,
            source: 'Walk-in',
            // Only customers come in: a new guest starts as one.
            status: 'Won',
            contactType: CUSTOMER_TYPE,
          },
          acct,
        ));
      // From here on they exist: a retry after a failed visit must not create them again.
      if (!known) {
        setPicked1(lead);
        setAdding(false);
      }
      // Only a guest added just now gets the birthday typed here (an existing one keeps theirs).
      const newBirthday = !existing ? day : '';
      const price = amount.trim() ? parseAmount(amount) : null;
      const res = await recordVisit(
        lead,
        {
          serviceIds: chosen,
          price: price != null && Number.isFinite(price) ? price : null,
          note,
          partySize: industry?.partySize && partyTouched ? party : null,
          birthday: newBirthday || undefined,
          servedBy,
        },
        acct,
      );
      void qc.invalidateQueries({ queryKey: ['visits'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['lead', lead.id] });
      void qc.invalidateQueries({ queryKey: ['services', 'contact', lead.id] });
      setDone({ lead: res.lead, visits: res.visits });
      if (res.failed.length) showAlert(t('visits.someMessagesFailed'), res.failed.join('\n'));
      if (res.profileFailed)
        showAlert(
          t('visits.profileFailedTitle', { defaultValue: 'Profile not updated' }),
          t('visits.profileFailed', {
            defaultValue: "The visit is saved, but the guest's visit count and spend could not be updated (check that your role can edit contacts).",
          }),
        );
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    const l = done.lead;
    return (
      <Screen title={t('visits.checkIn')} back>
        <View style={styles.done}>
          <View style={[styles.doneIcon, { backgroundColor: colors.primarySoft }]}>
            <CheckCircle2 size={34} color={colors.primary} />
          </View>
          <Text variant="h1" center>
            {t('visits.done')}
          </Text>
          <Text tone="muted" center>
            {t('visits.doneBody', { name: l.name, count: done.visits })}
          </Text>
          {l.tier ? <StatusPill label={t(`visits.tier.${l.tier}`)} color={tierColor(l.tier)} /> : null}
          <View style={{ gap: 10, alignSelf: 'stretch', marginTop: 20 }}>
            <Button title={t('visits.another')} size="lg" onPress={reset} />
            <Row gap={10}>
              <Button
                title={t('common.whatsapp')}
                variant="secondary"
                icon={<MessageCircle size={17} color={colors.text} />}
                style={{ flex: 1 }}
                onPress={() => messageOnWhatsApp({ phone: l.phone, leadId: l.id })}
              />
              <Button title={t('visits.openGuest')} variant="secondary" style={{ flex: 1 }} onPress={() => openContact(l.id)} />
            </Row>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title={t('visits.checkIn')}
      subtitle={t('visits.checkInSub')}
      back
      scroll
      footer={
        <Button
          title={t('visits.checkIn')}
          size="lg"
          loading={saving}
          disabled={!canSubmit || !chosen.length || exact.isFetching}
          onPress={() => void submit()}
        />
      }
    >
      <View style={{ gap: 22, marginTop: 4 }}>
        {/* Who it is. */}
        {known ? (
          <View style={[styles.guest, { borderColor: colors.border, borderRadius: radius.lg }]}>
            <Avatar name={known.name} uri={known.avatarUrl} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Row gap={8}>
                <Text variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {known.name}
                </Text>
                {known.tier ? <StatusPill label={t(`visits.tier.${known.tier}`)} color={tierColor(known.tier)} /> : null}
              </Row>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {[
                  known.phone ? formatPhone(known.phone) : null,
                  t('visits.visitsN', { count: known.visitCount || 0 }),
                  known.lastVisit ? t('visits.lastVisit', { when: fromNow(known.lastVisit) }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Pressable
              onPress={clearGuest}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('visits.changeGuest')}
              style={[styles.clear, { backgroundColor: colors.surfaceAlt }]}
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : isNew ? (
          <View style={{ gap: 14 }}>
            <Row gap={8} style={{ justifyContent: 'space-between' }}>
              <Row gap={8}>
                <UserRound size={16} color={colors.primary} />
                <Text variant="bodyStrong" tone="primary">
                  {t('visits.newGuest')}
                </Text>
              </Row>
              <Pressable onPress={clearGuest} hitSlop={10}>
                <Text variant="caption" tone="muted" style={{ fontWeight: '600' }}>
                  {t('visits.searchInstead')}
                </Text>
              </Pressable>
            </Row>
            <Input
              label={t('visits.name')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder={t('visits.namePh')}
              autoFocus={adding && !numberish}
            />
            {adding ? (
              <PhoneInput key={round} label={t('visits.phone')} value={phone} onChange={setPhone} autoFocus={numberish} />
            ) : (
              <Text variant="caption" tone="muted">
                {formatPhone(typedNumber)}
              </Text>
            )}
            {industry?.askBirthday !== false ? (
              <Input
                label={t('visits.birthday')}
                value={birthday}
                onChangeText={setBirthday}
                placeholder={t('visits.birthdayPh', { defaultValue: 'DD/MM or DD/MM/YYYY' })}
                keyboardType="numbers-and-punctuation"
              />
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <SearchField key={round} value={query} onChangeText={setQuery} placeholder={t('visits.searchPh')} autoFocus />
            {exact.isFetching || matches.isFetching ? (
              <Row gap={10} style={{ paddingVertical: 10, paddingHorizontal: 4 }}>
                <ActivityIndicator color={colors.primary} />
                <Text tone="muted">{t('visits.lookingUp')}</Text>
              </Row>
            ) : null}
            {typedNumber && exact.isError ? (
              <View style={[styles.results, { borderColor: colors.border, borderRadius: radius.lg }]}>
                <Text tone="danger" style={{ padding: 14 }}>
                  {describeCrmError(exact.error)}
                </Text>
                <Pressable onPress={() => void exact.refetch()} style={styles.result} accessibilityRole="button">
                  <Text variant="bodyStrong" tone="primary">
                    {t('common.retry')}
                  </Text>
                </Pressable>
                <Pressable onPress={startNew} style={styles.result} accessibilityRole="button">
                  <View style={[styles.addIcon, { backgroundColor: colors.primarySoft }]}>
                    <UserPlus size={17} color={colors.primary} />
                  </View>
                  <Text variant="bodyStrong" tone="primary" numberOfLines={1} style={{ flex: 1 }}>
                    {t('visits.addNew', { name: q })}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {q.length >= 2 && !typedNumber ? (
              <View style={[styles.results, { borderColor: colors.border, borderRadius: radius.lg }]}>
                {(matches.data ?? []).map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => setPicked1(l)}
                    style={({ pressed }) => [styles.result, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent', borderBottomColor: colors.border }]}
                  >
                    <Avatar name={l.name} uri={l.avatarUrl} size={36} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {l.name}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {[l.phone ? formatPhone(l.phone) : null, l.visitCount ? t('visits.visitsN', { count: l.visitCount }) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    {l.tier && l.visitCount ? <StatusPill label={t(`visits.tier.${l.tier}`)} color={tierColor(l.tier)} /> : null}
                  </Pressable>
                ))}
                {/* Not in the list: add them with what was typed. */}
                <Pressable onPress={startNew} style={({ pressed }) => [styles.result, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}>
                  <View style={[styles.addIcon, { backgroundColor: colors.primarySoft }]}>
                    <UserPlus size={17} color={colors.primary} />
                  </View>
                  <Text variant="bodyStrong" tone="primary" numberOfLines={1} style={{ flex: 1 }}>
                    {t('visits.addNew', { name: q })}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}

        {/* What the visit was. */}
        <View style={{ gap: 10 }}>
          <Text variant="caption" tone="muted" style={{ fontWeight: '500' }}>
            {t('visits.visitType')}
          </Text>
          {active.length ? (
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {active.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  selected={chosen.includes(s.id)}
                  onPress={() => setPicked((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur.filter((x) => chosen.includes(x)), s.id]))}
                />
              ))}
            </Row>
          ) : services.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />
          ) : (
            <Pressable onPress={() => router.push('/(app)/visits/setup')}>
              <Text tone="primary" variant="bodyStrong">
                {t('visits.noTypes')}
              </Text>
            </Pressable>
          )}
        </View>

        <ServedByPicker value={servedBy} onChange={setServedBy} />

        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Input label={t('visits.amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
          </View>
          {industry?.partySize ? (
            <View style={{ gap: 6 }}>
              <Text variant="caption" tone="muted" style={{ fontWeight: '500' }}>
                {t('visits.party')}
              </Text>
              <View style={[styles.stepper, { borderColor: colors.borderStrong, borderRadius: radius.md }]}>
                <Pressable
                  onPress={() => {
                    setParty((n) => Math.max(1, n - 1));
                    setPartyTouched(true);
                  }}
                  hitSlop={6}
                  style={styles.stepBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('visits.partyLess', { defaultValue: 'One fewer guest' })}
                >
                  <Minus size={16} color={colors.text} />
                </Pressable>
                <Text variant="bodyStrong" style={{ minWidth: 28, textAlign: 'center' }}>
                  {party}
                </Text>
                <Pressable
                  onPress={() => {
                    setParty((n) => Math.min(99, n + 1));
                    setPartyTouched(true);
                  }}
                  hitSlop={6}
                  style={styles.stepBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('visits.partyMore', { defaultValue: 'One more guest' })}
                >
                  <Plus size={16} color={colors.text} />
                </Pressable>
              </View>
            </View>
          ) : null}
        </Row>
        <Input label={t('visits.note')} value={note} onChangeText={setNote} placeholder={t('visits.notePh')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  guest: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  clear: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  results: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  addIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 46, borderWidth: 1, paddingHorizontal: 4 },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60, maxWidth: 420, width: '100%', alignSelf: 'center' },
  doneIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
});

export default function CheckInGate() {
  // One form per account: a switch while it's open starts it fresh, never saving into the other account.
  const acct = useAccountsStore((s) => s.activeId);
  return (
    <RequireCan any={[P.app.visits]}>
      <CheckIn key={acct ?? 'none'} />
    </RequireCan>
  );
}
