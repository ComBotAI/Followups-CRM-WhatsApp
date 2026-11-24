/**
 * Lead fields. Edit the dropdown options behind Contact type, Status, Product, Priority and
 * Source; add your own fields (text, number, date, dropdown, …) that show on
 * every lead's form and details; check the schema.
 */
import { Redirect } from 'expo-router';
import { useIsOwner } from '@/stores/auth';
import type { CustomField } from '@ab-ecosystem/cpaas';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Input, Row, Screen, Sheet, Text } from '@/components/ui';
import { keys, useFields, useLeadOptions } from '@/hooks/queries';
import { confirmAction, showAlert } from '@/lib/dialog';
import { describeCrmError } from '@/services/crm/client';
import {
  createUserField,
  deleteUserField,
  dropdownOptions,
  ensureLeadSchema,
  F,
  isUserField,
  LEAD_FIELDS,
  renameField,
  setDropdownOptions,
  USER_FIELD_TYPES,
  type UserFieldType,
} from '@/services/crm/schema';
import { useTheme } from '@/theme/ThemeProvider';

function FieldsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const options = useLeadOptions();
  const fields = useFields();
  const [repairing, setRepairing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const present = new Set((fields.data ?? []).map((f) => f.slug));
  const missing = LEAD_FIELDS.filter((f) => !present.has(f.slug));
  const mine = (fields.data ?? []).filter((f) => isUserField(f.slug));

  const repair = async () => {
    setRepairing(true);
    try {
      const { report } = await ensureLeadSchema();
      void qc.invalidateQueries({ queryKey: keys.fields });
      showAlert(t('fields.checked'), t('fields.checkedBody', { created: report.created.length, existing: report.existing.length }));
    } catch (err) {
      showAlert(t('common.errorTitle'), describeCrmError(err));
    } finally {
      setRepairing(false);
    }
  };

  return (
    <Screen title={t('settings.fields')} subtitle={t('settings.fieldsSub')} back scroll>
      <View style={{ gap: 14, marginTop: 8 }}>
        <OptionEditor slug={F.contactType} title={t('leads.contactType')} values={options.contactTypes} tone="success" />
        <OptionEditor slug={F.status} title={t('fields.statuses')} values={options.statuses} tone="primary" />

        <Row style={{ justifyContent: 'space-between', marginStart: 4, marginTop: 4 }}>
          <Text variant="micro" tone="faint">
            {t('fields.yourFields').toUpperCase()}
          </Text>
        </Row>
        <Card padded={false}>
          {mine.map((f, i) => (
            <View key={f.slug} style={[styles.fieldRow, i > 0 && styles.divider]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{f.name ?? f.slug}</Text>
                <Text variant="caption" tone="muted">
                  {t(`fields.type.${f.dataType}`, { defaultValue: f.dataType })}
                  {f.dataType === 'dropdown' ? ` · ${dropdownOptions(f).length} ${t('fields.options')}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => setEditing(f)} hitSlop={8}>
                <Pencil size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
          <View style={{ padding: 12, gap: 8 }}>
            {!mine.length ? (
              <Text variant="caption" tone="muted">
                {t('fields.noneYet')}
              </Text>
            ) : null}
            <Button title={t('fields.add')} variant="secondary" icon={<Plus size={16} color={colors.primary} />} onPress={() => setAdding(true)} />
          </View>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text variant="h3">{t('fields.schema')}</Text>
          <Text variant="caption" tone="muted">
            {t('fields.schemaCount', { have: LEAD_FIELDS.length - missing.length, total: LEAD_FIELDS.length })}
          </Text>
          {missing.length ? (
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {missing.map((f) => (
                <Chip key={f.slug} label={f.name} tone="danger" small />
              ))}
            </Row>
          ) : null}
          <Button title={t('fields.repair')} variant="secondary" onPress={() => void repair()} loading={repairing} />
          <Text variant="micro" tone="faint">
            {t('fields.schemaNote')}
          </Text>
        </Card>
      </View>
      {adding ? <AddFieldSheet taken={[...present]} onClose={() => setAdding(false)} /> : null}
      {editing ? <EditFieldSheet field={editing} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

function OptionEditor({ slug, title, values, tone }: { slug: string; title: string; values: string[]; tone: 'primary' | 'accent' | 'warning' | 'success' }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const commit = async (next: string[]): Promise<boolean> => {
    setBusy(true);
    try {
      await setDropdownOptions(slug, next);
      void qc.invalidateQueries({ queryKey: keys.fields });
      return true;
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    const v = draft.trim();
    // One save at a time (the list updates after it), and the text stays if the save failed.
    if (!v || busy || values.includes(v)) return;
    void commit([...values, v]).then((ok) => ok && setDraft(''));
  };

  return (
    <Card style={{ gap: 10 }}>
      <Text variant="h3">{title}</Text>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {values.map((v) => (
          <Chip
            key={v}
            label={v}
            tone={tone}
            icon={
              <Pressable
                hitSlop={8}
                onPress={() =>
                  void confirmAction({
                    title: t('fields.removeTitle', { value: v }),
                    message: t('fields.removeBody'),
                    confirmText: t('fields.remove'),
                    cancelText: t('common.cancel'),
                    destructive: true,
                  }).then((ok) => {
                    if (ok) void commit(values.filter((x) => x !== v));
                  })
                }
              >
                <X size={12} color={colors.textMuted} />
              </Pressable>
            }
          />
        ))}
      </Row>
      <Row gap={8}>
        <View style={{ flex: 1 }}>
          <Input placeholder={t('fields.addOption')} value={draft} onChangeText={setDraft} autoCapitalize="words" onSubmitEditing={add} />
        </View>
        <Button icon={<Plus size={16} color={colors.onPrimary} />} onPress={add} loading={busy} style={styles.addBtn} />
      </Row>
    </Card>
  );
}

function OptionsInput({ options, onChange }: { options: string[]; onChange: (o: string[]) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !options.includes(v)) onChange([...options, v]);
    setDraft('');
  };
  return (
    <View style={{ gap: 8 }}>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {options.map((o) => (
          <Chip
            key={o}
            small
            label={o}
            icon={
              <Pressable hitSlop={8} onPress={() => onChange(options.filter((x) => x !== o))}>
                <X size={12} color={colors.textMuted} />
              </Pressable>
            }
          />
        ))}
      </Row>
      <Row gap={8}>
        <View style={{ flex: 1 }}>
          <Input placeholder={t('fields.addOption')} value={draft} onChangeText={setDraft} onSubmitEditing={add} />
        </View>
        <Button icon={<Plus size={16} color={colors.onPrimary} />} onPress={add} style={styles.addBtn} />
      </Row>
    </View>
  );
}

function AddFieldSheet({ taken, onClose }: { taken: string[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<UserFieldType>('text');
  const [options, setOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return showAlert(t('fields.needName'));
    if (type === 'dropdown' && !options.length) return showAlert(t('fields.needOptions'));
    setBusy(true);
    try {
      await createUserField({ name, type, options, taken });
      await qc.invalidateQueries({ queryKey: keys.fields });
      onClose();
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('fields.add')}
      subtitle={t('fields.addSub')}
      footer={<Button title={t('fields.create')} loading={busy} onPress={() => void save()} />}
    >
      <View style={{ gap: 12 }}>
        <Input label={t('fields.name')} value={name} onChangeText={setName} placeholder={t('fields.namePh')} autoFocus />
        <Text variant="caption" tone="muted">
          {t('fields.typeLabel')}
        </Text>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {USER_FIELD_TYPES.map((ty) => (
            <Chip key={ty} small label={t(`fields.type.${ty}`)} selected={type === ty} onPress={() => setType(ty)} />
          ))}
        </Row>
        {type === 'dropdown' ? <OptionsInput options={options} onChange={setOptions} /> : null}
      </View>
    </Sheet>
  );
}

function EditFieldSheet({ field, onClose }: { field: CustomField; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState(field.name ?? '');
  const [options, setOptions] = useState<string[]>(() => dropdownOptions(field));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (name.trim() && name.trim() !== field.name) await renameField(field.slug, name);
      if (field.dataType === 'dropdown') await setDropdownOptions(field.slug, options);
      await qc.invalidateQueries({ queryKey: keys.fields });
      onClose();
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: t('fields.deleteTitle', { name: field.name ?? field.slug }),
      message: t('fields.deleteBody'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteUserField(field.slug);
      await qc.invalidateQueries({ queryKey: keys.fields });
      onClose();
    } catch (err) {
      showAlert(t('common.errorTitle'), describeCrmError(err));
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={field.name ?? field.slug}
      subtitle={t(`fields.type.${field.dataType}`, { defaultValue: field.dataType })}
      footer={
        <Row gap={10}>
          <Button title={t('common.delete')} variant="ghost" icon={<Trash2 size={16} color={colors.danger} />} onPress={() => void remove()} />
          <Button title={t('common.save')} loading={busy} onPress={() => void save()} style={{ flex: 1 }} />
        </Row>
      }
    >
      <View style={{ gap: 12 }}>
        <Input label={t('fields.name')} value={name} onChangeText={setName} />
        {field.dataType === 'dropdown' ? <OptionsInput options={options} onChange={setOptions} /> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 48, paddingHorizontal: 0 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.25)' },
});

/** Owner only, like Roles: hidden from members in More, and blocked when opened by link. */
export default function FieldsScreenGate() {
  const isOwner = useIsOwner();
  if (!isOwner) return <Redirect href="/(app)/(tabs)/more" />;
  return <FieldsScreen />;
}
