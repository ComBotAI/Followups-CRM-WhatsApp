/**
 * Lead assignment.
 *
 * A lead's assignee is the native `contact.agent` field. The CPaaS `data_scope`
 * of a member's role then decides what they see: `own` ⇒ only leads where
 * `agent` is them. We write the member's *user id* (profile id) there, which is
 * the identity their session carries; the owner's user id is their own
 * profile id. `lead_assigned_name` caches the display name.
 *
 * Round-robin state (the pointer) lives in MMKV per account; the next import
 * or bulk assign continues from where the last one stopped.
 */
import type { Teammate } from '@/services/sso/client';
import { kv } from '@/services/storage';
import { crm } from './client';
import { F } from './schema';
import type { Lead } from './leads';

export type AssignmentRule = {
  mode: 'round_robin_all' | 'round_robin_selected' | 'single' | 'none';
  /** Teammate user ids for `round_robin_selected` / `single`. */
  memberIds: string[];
};

const RULE_KEY = 'assignment.rule.v1';
const POINTER_KEY = 'assignment.pointer.v1';

export const readAssignmentRule = (): AssignmentRule => {
  const raw = kv().getString(RULE_KEY);
  if (!raw) return { mode: 'none', memberIds: [] };
  try {
    return JSON.parse(raw) as AssignmentRule;
  } catch {
    return { mode: 'none', memberIds: [] };
  }
};

export const writeAssignmentRule = (rule: AssignmentRule) => {
  kv().set(RULE_KEY, JSON.stringify(rule));
  void import('@/services/cloudSettings').then((m) => m.settingsChanged()).catch(() => undefined);
};

/** Picks the next assignee according to the rule. Returns null when the rule is `none`. */
export const nextAssignee = (rule: AssignmentRule, team: Teammate[]): Teammate | null => {
  const pool =
    rule.mode === 'round_robin_all'
      ? team.filter((t) => t.status !== 'revoked')
      : rule.mode === 'round_robin_selected' || rule.mode === 'single'
        ? team.filter((t) => rule.memberIds.includes(t.userId))
        : [];
  if (!pool.length) return null;
  if (rule.mode === 'single') return pool[0];
  const pointer = kv().getNumber(POINTER_KEY) ?? 0;
  const pick = pool[pointer % pool.length];
  kv().set(POINTER_KEY, (pointer + 1) % pool.length);
  return pick;
};

export const assignLead = async (lead: Pick<Lead, 'id'>, to: Teammate | null): Promise<void> => {
  // The server's current values, not the list's cached copy (which may predate a newer edit). No
  // fallback to the cached copy when this read fails: the hash replaces wholesale, so a stale copy
  // would undo newer edits. The assignment fails instead and can be retried.
  const current = { ...((await crm().contacts.get(lead.id)).custom_field_hash ?? {}) };
  if (to) current[F.assignedName] = to.name;
  // Unassigned: no name at all (a missing key and '' both read as unassigned).
  else delete current[F.assignedName];
  await crm().contacts.update(lead.id, { agent: to?.userId ?? null, custom_field_hash: current });
};

/** Distributes many leads round-robin over `pool` (or the saved rule). Returns per-member counts. */
export const assignLeadsRoundRobin = async (
  leads: Pick<Lead, 'id'>[],
  pool: Teammate[],
  onProgress?: (done: number) => void,
): Promise<Record<string, number>> => {
  const counts: Record<string, number> = {};
  if (!pool.length) return counts;
  let pointer = kv().getNumber(POINTER_KEY) ?? 0;
  let done = 0;
  for (const lead of leads) {
    const to = pool[pointer % pool.length];
    pointer += 1;
    await assignLead(lead, to);
    counts[to.userId] = (counts[to.userId] ?? 0) + 1;
    done += 1;
    onProgress?.(done);
  }
  kv().set(POINTER_KEY, pointer % pool.length);
  return counts;
};
