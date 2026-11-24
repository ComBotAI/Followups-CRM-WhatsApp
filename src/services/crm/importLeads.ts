/**
 * Excel / CSV import. Parses on-device, lets the user map columns, then
 * creates contacts a few at a time (the audience import endpoint needs a
 * storage key the mobile app cannot produce). Duplicate numbers come back as 409 and
 * are counted, not failed.
 */
import { File } from 'expo-file-system';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

import { normalizePhone } from '@/lib/phone';
import { CrmApiError } from './client';
import { createLead, type LeadInput } from './leads';
import type { LeadStatus } from './schema';

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
};

export const parseSheetFile = async (uri: string, name: string, mimeType?: string): Promise<ParsedSheet> => {
  const file = new File(uri);
  const lower = name.toLowerCase();
  const isCsv = lower.endsWith('.csv') || lower.endsWith('.txt') || mimeType === 'text/csv';
  if (isCsv) {
    const text = await file.text();
    const res = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    const headers = res.meta.fields ?? [];
    return { headers, rows: res.data, fileName: name };
  }
  const bytes = await file.bytes();
  const wb = XLSX.read(bytes, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return {
    headers,
    rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '').trim()]))),
    fileName: name,
  };
};

export type ColumnMap = {
  phone: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  remark?: string;
};

const GUESS: Record<keyof ColumnMap, RegExp> = {
  phone: /^(phone|mobile|number|contact|whatsapp|cell|tel|phone ?number|mobile ?number)$/i,
  name: /^(name|full ?name|lead|customer|client)$/i,
  firstName: /^(first ?name|fname|given)$/i,
  lastName: /^(last ?name|lname|surname|family)$/i,
  remark: /^(remark|remarks|note|notes|comment|comments)$/i,
};

/** Best-effort automatic mapping from header names. */
export const guessColumnMap = (headers: string[]): ColumnMap => {
  const map: Partial<ColumnMap> = {};
  for (const key of Object.keys(GUESS) as (keyof ColumnMap)[]) {
    const hit = headers.find((h) => GUESS[key].test(h.trim()));
    if (hit) map[key] = hit;
  }
  if (!map.phone) {
    // Fallback: the first column whose values look like phone numbers is chosen by the caller.
    map.phone = headers.find((h) => /phone|mobile|number/i.test(h)) ?? headers[0] ?? '';
  }
  return map as ColumnMap;
};

export type ImportRowResult = 'created' | 'duplicate' | 'invalid' | 'failed';
export type ImportSummary = {
  total: number;
  created: number;
  duplicate: number;
  invalid: number;
  failed: number;
  errors: string[];
};

export const importRows = async (
  sheet: ParsedSheet,
  map: ColumnMap,
  defaults: {
    status?: LeadStatus;
    tags?: string[];
    assignNext?: () => { userId: string; name: string } | null;
  },
  onProgress?: (done: number, total: number, last: ImportRowResult) => void,
  /** Contacts created at once. A few: quick, without running into the gateway's rate limit. */
  concurrency = 3,
): Promise<ImportSummary> => {
  const summary: ImportSummary = {
    total: sheet.rows.length,
    created: 0,
    duplicate: 0,
    invalid: 0,
    failed: 0,
    errors: [],
  };
  let done = 0;
  const report = (result: ImportRowResult) => {
    done += 1;
    onProgress?.(done, summary.total, result);
  };

  // Rows with no usable number, and repeats of a number earlier in the file, are settled up front
  // (in file order), so creating several at once never sends the same number twice.
  const seen = new Set<string>();
  const todo: { row: Record<string, string>; phone: string }[] = [];
  for (const row of sheet.rows) {
    const phone = normalizePhone(row[map.phone] ?? '');
    if (!phone || seen.has(phone)) {
      summary[phone ? 'duplicate' : 'invalid'] += 1;
      report(phone ? 'duplicate' : 'invalid');
      continue;
    }
    seen.add(phone);
    todo.push({ row, phone });
  }

  // An assignee picked for a row that then wasn't created (already a contact, or failed) goes to
  // the next row instead, so the round robin stays even.
  type Assignee = { userId: string; name: string } | null;
  const returned: Assignee[] = [];
  const nextAssignee = (): Assignee => (returned.length ? returned.shift()! : (defaults.assignNext?.() ?? null));

  let stop = false;
  let next = 0;
  const worker = async () => {
    while (!stop && next < todo.length) {
      const { row, phone } = todo[next++];
      let firstName = map.firstName ? row[map.firstName] : '';
      let lastName = map.lastName ? row[map.lastName] : '';
      if (!firstName && map.name) {
        const [f, ...rest] = (row[map.name] ?? '').split(' ').filter(Boolean);
        firstName = f ?? '';
        lastName = rest.join(' ');
      }
      const assignee = nextAssignee();
      const input: LeadInput = {
        firstName,
        lastName,
        // Already normalized: the + keeps createLead from adding a country code again.
        phone: `+${phone}`,
        source: 'Import',
        lastRemark: map.remark ? row[map.remark] : undefined,
        status: defaults.status ?? 'New',
        tags: defaults.tags,
        agentId: assignee?.userId ?? undefined,
        assignedName: assignee?.name ?? undefined,
      };
      try {
        await createLead(input);
        summary.created += 1;
        report('created');
      } catch (err) {
        if (assignee) returned.push(assignee);
        if (err instanceof CrmApiError && err.status === 409) {
          summary.duplicate += 1;
          report('duplicate');
        } else {
          summary.failed += 1;
          if (summary.errors.length < 5) summary.errors.push(err instanceof Error ? err.message : 'Unknown error');
          report('failed');
          if (err instanceof CrmApiError && err.status === 402) stop = true; // plan quota: stop early
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, todo.length)) }, worker));
  return summary;
};
