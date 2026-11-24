/** Workspace setup status: the lead fields and the data store, with a way into the setup journey that creates whatever is missing. */
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CircleCheck, CircleX, Database, Sliders, Wand2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Row, Screen, Text } from '@/components/ui';
import { keys, useFields } from '@/hooks/queries';
import { useWorkspaceSetupStatus } from '@/hooks/useWorkspaceSetup';
import { useIsOwner } from '@/stores/auth';
import { cachedHandle, ensureDataStore, STORE_TITLE } from '@/services/crm/datastore';
import { LEAD_FIELDS } from '@/services/crm/schema';
import { showAlert } from '@/lib/dialog';
import { describeCrmError } from '@/services/crm/client';
import { useTheme } from '@/theme/ThemeProvider';

export default function SetupScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const fields = useFields();
  const [busy, setBusy] = useState<string | null>(null);
  const isOwner = useIsOwner();
  const status = useWorkspaceSetupStatus();
  const [, bump] = useState(0);
  const ds = cachedHandle();
  const present = new Set((fields.data ?? []).map((f) => f.slug));
  const missing = LEAD_FIELDS.filter((f) => !present.has(f.slug)).length;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      // Never a silent failure: say what went wrong.
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setBusy(null);
      bump((n) => n + 1);
    }
  };

  return (
    <Screen title={t('settings.setup')} subtitle={t('settings.setupSub')} back scroll>
      <View style={{ gap: 14, marginTop: 8 }}>
        {isOwner ? (
          <Card style={{ gap: 8 }}>
            <Row gap={8}>
              <Wand2 size={18} color={colors.primary} />
              <Text variant="h3" style={{ flex: 1 }}>
                {t('wsetup.title', { defaultValue: 'Set up your workspace' })}
              </Text>
              {status.known ? status.complete ? <CircleCheck size={18} color={colors.success} /> : <CircleX size={18} color={colors.danger} /> : null}
            </Row>
            <Text variant="caption" tone="muted">
              {status.complete
                ? t('wsetup.allSet', { defaultValue: 'Lead fields and the data store are in place.' })
                : t('wsetup.subtitle', { defaultValue: 'Two quick steps before you start: your lead fields and your data store.' })}
            </Text>
            {status.complete ? null : <Button title={t('wsetup.open', { defaultValue: 'Open setup' })} onPress={() => router.push('/workspace-setup')} />}
          </Card>
        ) : null}

        <Card style={{ gap: 8 }}>
          <Row gap={8}>
            <Sliders size={18} color={colors.primary} />
            <Text variant="h3">{t('setup.leadFields', { defaultValue: 'Lead fields' })}</Text>
            {missing === 0 ? <CircleCheck size={18} color={colors.success} /> : <CircleX size={18} color={colors.danger} />}
          </Row>
          <Text variant="caption" tone="muted">
            {t('setup.fieldsCount', {
              defaultValue: '{{have}} of {{total}} custom fields exist (status, contact type, follow-up, product…).',
              have: LEAD_FIELDS.length - missing,
              total: LEAD_FIELDS.length,
            })}
          </Text>
          <Button
            title={t('setup.checkAgain', { defaultValue: 'Check again' })}
            variant="secondary"
            loading={busy === 'schema'}
            onPress={() => void run('schema', () => qc.invalidateQueries({ queryKey: keys.fields }))}
          />
        </Card>

        <Card style={{ gap: 8 }}>
          <Row gap={8}>
            <Database size={18} color={colors.accent} />
            <Text variant="h3">{t('setup.dataStore', { defaultValue: 'Data store “{{name}}”', name: STORE_TITLE })}</Text>
            {ds?.available ? <CircleCheck size={18} color={colors.success} /> : <CircleX size={18} color={colors.danger} />}
          </Row>
          <Text variant="caption" tone="muted">
            {ds?.available
              ? t('setup.dataStoreOk', {
                  defaultValue: 'Cloud store with {{count}} collections: remarks, reminders and more.',
                  count: Object.keys(ds.collections).length,
                })
              : ds?.reason || t('setup.dataStoreMissing', { defaultValue: 'Not created yet.' })}
          </Text>
          <Button
            title={t('setup.verifyStore', { defaultValue: 'Verify data store' })}
            variant="secondary"
            loading={busy === 'ds'}
            onPress={() => void run('ds', () => ensureDataStore(true))}
          />
        </Card>
      </View>
    </Screen>
  );
}
