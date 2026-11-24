/**
 * Saved segments: named contact filters stored on the CPaaS account. They
 * hold no contact ids, so a segment always matches whoever fits it right now.
 */
import { countActiveFilters, type LeadFilter } from '@/lib/filters';
import { crm } from './client';
import { resolveCondition } from './sequences';

/**
 * What a segment can hold. Search text is never saved, and neither is a
 * specific agent: the filter language has no assignee field (agent is a
 * separate query parameter), so it stays a filter applied on top. "Unassigned"
 * is a real condition and is kept.
 */
export const segmentableFilter = (f: LeadFilter): LeadFilter => {
  const { search: _search, agent, ...rest } = f;
  return agent === 'unassigned' ? { ...rest, agent } : rest;
};

export const canSaveAsSegment = (f: LeadFilter) => countActiveFilters(segmentableFilter(f)) > 0;

/**
 * Saves the filter as a segment. A segment cannot point at another segment,
 * so if the filter starts from one, that segment's rules are copied in.
 */
export const createSegment = async (name: string, f: LeadFilter, description?: string) => {
  const filter = await resolveCondition(segmentableFilter(f));
  return crm().segments.create({ name: name.trim(), description: description?.trim() || undefined, filter: filter ?? { type: 'followups', conditions: [] } });
};

export const deleteSegment = (id: string) => crm().segments.delete(id);
