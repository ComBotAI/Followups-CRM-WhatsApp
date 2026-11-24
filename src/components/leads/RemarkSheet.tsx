import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/lib/dialog';
import { applySlash, QuickReplySuggest } from '@/components/QuickReplySuggest';
import { Button, Input, Sheet } from '@/components/ui';
import { replyText } from '@/services/crm/quickReplies';
import { senderContext } from '@/services/crm/sequences';
import { keys, useLead } from '@/hooks/queries';
import { describeCrmError } from '@/services/crm/client';
import { getLead, updateLead, type Lead } from '@/services/crm/leads';
import { addRemark, localRemarks, type Remark } from '@/services/crm/records';
import { useMyId, useMyName } from '@/stores/auth';

export function RemarkSheet({ lead, open, onClose }: { lead: Pick<Lead, 'id' | 'name'>; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const myName = useMyName();
  const myId = useMyId();
  const [text, setText] = useState('');
  const fullLead = useLead(open ? lead.id : undefined);
  const [saving, setSaving] = useState(false);

  // Saved on the phone and closed at once; the upload and the lead's "last remark" follow in the background.
  const save = () => {
    const body = text.trim();
    if (!body) return;
    setSaving(true);
    try {
      const upload = addRemark({
        contact_id: lead.id,
        text: body,
        member_id: myId,
        member_name: myName,
      });
      // `addRemark` writes the phone's copy before its first await: show it now.
      qc.setQueryData<Remark[]>(keys.remarks(lead.id), (prev) => {
        const local = localRemarks(lead.id);
        return [...local.filter((r) => !(prev ?? []).some((p) => p.id === r.id)), ...(prev ?? [])];
      });
      void upload.then(() => qc.invalidateQueries({ queryKey: keys.remarks(lead.id) }));
      void getLead(lead.id)
        .then((fresh) => updateLead(fresh, { lastRemark: body }))
        .then((updated) => qc.setQueryData(keys.lead(lead.id), updated))
        .catch(() => undefined)
        .finally(() => void qc.invalidateQueries({ queryKey: ['leads'], refetchType: 'none' }));
      setText('');
      onClose();
    } catch (err) {
      showAlert(t('common.couldNotSave'), describeCrmError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('remarkSheet.title')}
      subtitle={lead.name}
      locked={saving}
      footer={<Button title={t('remarkSheet.save')} full onPress={save} loading={saving} disabled={!text.trim()} />}
    >
      <QuickReplySuggest
        text={text}
        onPick={(r) => setText((cur) => applySlash(cur, replyText(r, fullLead.data ?? null, senderContext())))}
      />
      <Input
        placeholder={t('remarkSheet.placeholder')}
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        autoCapitalize="sentences"
        style={{ minHeight: 100, textAlignVertical: 'top' }}
      />
    </Sheet>
  );
}
