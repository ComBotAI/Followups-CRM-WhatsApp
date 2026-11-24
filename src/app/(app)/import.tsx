/**
 * Excel / CSV import: pick a file → map columns → choose defaults and
 * assignment → import with live progress.
 */
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { FileSpreadsheet, Shuffle } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { showAlert } from '@/lib/dialog';
import { Button, Card, Chip, EmptyState, Row, Screen, Text } from '@/components/ui';
import { useLeadOptions, useTags, useTeam } from '@/hooks/queries';
import { nextAssignee, readAssignmentRule } from '@/services/crm/assignment';
import { guessColumnMap, importRows, parseSheetFile, type ColumnMap, type ImportSummary, type ParsedSheet } from '@/services/crm/importLeads';
import type { LeadStatus } from '@/services/crm/schema';
import { useIsOwner } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { describeCrmError } from '@/services/crm/client';
import { RequireCan } from '@/components/RequireCan';
import { P } from '@/lib/permissions';

const TARGETS: { key: keyof ColumnMap; label: string; required?: boolean }[] = [
  { key: 'phone', label: 'Phone', required: true },
  { key: 'name', label: 'Full name' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'remark', label: 'Remark' },
];

function ImportScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const isOwner = useIsOwner();
  const options = useLeadOptions();
  const tags = useTags();
  const team = useTeam();
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [map, setMap] = useState<ColumnMap>({ phone: '' });
  const [status, setStatus] = useState<LeadStatus>('New');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [assignMode, setAssignMode] = useState<'none' | 'rule' | 'round_robin'>('none');
  const [pool, setPool] = useState<string[]>([]);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [activeTarget, setActiveTarget] = useState<keyof ColumnMap>('phone');

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'text/csv',
        'text/comma-separated-values',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        '*/*',
      ],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    try {
      const parsed = await parseSheetFile(a.uri, a.name, a.mimeType);
      if (!parsed.rows.length) return showAlert(t('import.emptyFile'), t('import.noRows'));
      setSheet(parsed);
      setMap(guessColumnMap(parsed.headers));
      setSummary(null);
    } catch (err) {
      showAlert(t('import.readFailed'), err instanceof Error ? err.message : '');
    }
  };

  const sample = useMemo(() => sheet?.rows[0] ?? {}, [sheet]);
  const validPhones = useMemo(
    () => (sheet && map.phone ? sheet.rows.filter((r) => (r[map.phone] ?? '').replace(/\D/g, '').length >= 8).length : 0),
    [sheet, map.phone],
  );

  const run = async () => {
    if (!sheet) return;
    if (!map.phone) return showAlert(t('import.mapPhone'));
    setProgress({ done: 0, total: sheet.rows.length });
    let rr = 0;
    const members = (team.data ?? []).filter((m) => (pool.length ? pool.includes(m.userId) : true));
    const rule = readAssignmentRule();
    const assignNext =
      assignMode === 'none'
        ? undefined
        : assignMode === 'rule'
          ? () => {
              const t = nextAssignee(rule, team.data ?? []);
              return t ? { userId: t.userId, name: t.name } : null;
            }
          : () => {
              if (!members.length) return null;
              const m = members[rr++ % members.length];
              return { userId: m.userId, name: m.name };
            };
    try {
      const result = await importRows(
        sheet,
        map,
        {
          status,
          tags: tagIds.length ? tagIds : undefined,
          assignNext,
        },
        (done, total) => setProgress({ done, total }),
      );
      setSummary(result);
    } catch (e) {
      // A failed import must not leave the button spinning.
      showAlert(t('import.failed'), describeCrmError(e));
    } finally {
      setProgress(null);
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['board'] });
    }
  };

  if (summary) {
    return (
      <Screen title={t('import.complete')} back>
        <Card style={{ gap: 6, marginTop: 8 }}>
          <Big label={t('import.created')} value={summary.created} tone="success" />
          <Row gap={16}>
            <Small label={t('import.duplicates')} value={summary.duplicate} />
            <Small label={t('import.invalid')} value={summary.invalid} />
            <Small label={t('import.failed')} value={summary.failed} />
          </Row>
          {summary.errors.map((e, i) => (
            <Text key={i} variant="caption" tone="danger">
              {e}
            </Text>
          ))}
        </Card>
        <Button title={t('import.viewLeads')} full onPress={() => router.replace('/(app)/(tabs)/contacts')} style={{ marginTop: 16 }} />
        <Button
          title={t('import.another')}
          variant="ghost"
          onPress={() => {
            setSummary(null);
            setSheet(null);
          }}
          style={{ alignSelf: 'center', marginTop: 6 }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('import.title')}
      subtitle={sheet ? t('import.rows', { file: sheet.fileName, count: sheet.rows.length }) : t('import.subtitle')}
      back
      footer={
        sheet ? (
          <Button
            title={
              progress
                ? t('import.importing', {
                    done: progress.done,
                    total: progress.total,
                  })
                : t('import.importN', { count: validPhones })
            }
            size="lg"
            full
            onPress={() => void run()}
            loading={!!progress}
            disabled={!validPhones}
          />
        ) : undefined
      }
      padded={false}
    >
      {!sheet ? (
        <EmptyState
          icon={<FileSpreadsheet size={28} color={colors.primary} />}
          title={t('import.pickTitle')}
          body={t('import.pickBody')}
          action={t('import.chooseFile')}
          onAction={() => void pick()}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
          <Card style={{ gap: 10 }}>
            <Text variant="h3">{t('import.columns')}</Text>
            <Text variant="caption" tone="muted">
              {t('import.columnsHint')}
            </Text>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {TARGETS.map((t) => (
                <Chip
                  key={t.key}
                  label={`${t.label}${map[t.key] ? `: ${map[t.key]}` : t.required ? ' *' : ''}`}
                  selected={activeTarget === t.key}
                  tone={map[t.key] ? 'primary' : 'neutral'}
                  onPress={() => setActiveTarget(t.key)}
                />
              ))}
            </Row>
            <View style={[styles.cols, { borderColor: colors.border }]}>
              {sheet.headers.map((h) => (
                <Chip
                  key={h}
                  label={`${h} → "${String(sample[h] ?? '').slice(0, 18)}"`}
                  selected={map[activeTarget] === h}
                  onPress={() =>
                    setMap((m) => ({
                      ...m,
                      [activeTarget]: m[activeTarget] === h ? '' : h,
                    }))
                  }
                  style={{ marginBottom: 6 }}
                />
              ))}
            </View>
            <Text variant="caption" tone={validPhones ? 'success' : 'danger'}>
              {t('import.usable', {
                valid: validPhones,
                total: sheet.rows.length,
              })}
            </Text>
          </Card>

          <Card style={{ gap: 10 }}>
            <Text variant="h3">{t('import.defaults')}</Text>
            <Field label={t('common.status')}>
              {options.statuses.map((s) => (
                <Chip key={s} label={t(`status.${s}`, { defaultValue: s })} selected={status === s} onPress={() => setStatus(s as LeadStatus)} />
              ))}
            </Field>
            {tags.data?.length ? (
              <Field label={t('import.tagAll')}>
                {tags.data.map((t) => (
                  <Chip
                    key={t.id}
                    label={t.name}
                    color={t.color || undefined}
                    selected={tagIds.includes(t.id)}
                    onPress={() => setTagIds((ids) => (ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id]))}
                  />
                ))}
              </Field>
            ) : null}
          </Card>

          {isOwner && team.data?.length ? (
            <Card style={{ gap: 10 }}>
              <Row gap={8}>
                <Shuffle size={18} color={colors.success} />
                <Text variant="h3">{t('import.assignToTeam')}</Text>
              </Row>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                <Chip label={t('import.dontAssign')} selected={assignMode === 'none'} onPress={() => setAssignMode('none')} />
                <Chip label={t('import.useRule')} selected={assignMode === 'rule'} onPress={() => setAssignMode('rule')} />
                <Chip label={t('assignSheet.roundRobin')} selected={assignMode === 'round_robin'} onPress={() => setAssignMode('round_robin')} />
              </Row>
              {assignMode === 'round_robin' ? (
                <Field label={t('import.among')}>
                  {team.data.map((m) => (
                    <Chip
                      key={m.userId}
                      label={m.name}
                      selected={pool.includes(m.userId)}
                      onPress={() => setPool((p) => (p.includes(m.userId) ? p.filter((x) => x !== m.userId) : [...p, m.userId]))}
                    />
                  ))}
                </Field>
              ) : null}
            </Card>
          ) : null}
          <Button title={t('import.differentFile')} variant="ghost" onPress={() => void pick()} style={{ alignSelf: 'center' }} />
        </ScrollView>
      )}
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {children}
      </Row>
    </View>
  );
}

function Big({ label, value, tone }: { label: string; value: number; tone: 'success' | 'default' }) {
  return (
    <View>
      <Text variant="display" tone={tone}>
        {value}
      </Text>
      <Text tone="muted">{label}</Text>
    </View>
  );
}
function Small({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <Text variant="h3">{value}</Text>
      <Text variant="micro" tone="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cols: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

/** Members whose role can't open this page get a short explanation instead. */
export default function ImportScreenGate() {
  return (
    <RequireCan all={[P.contacts.create, P.app.importLeads]}>
      <ImportScreen />
    </RequireCan>
  );
}
