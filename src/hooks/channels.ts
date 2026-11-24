/** React Query hooks for channels. Writes invalidate `channelKeys.all` and the WhatsApp channel list. */
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getChannel, listChannels, onboardingOptions, signupUrl } from '@/services/crm/channels';
import { describeCrmError } from '@/services/crm/client';
import { waKeys } from './queries';

export const channelKeys = {
  all: ['channels'] as const,
  list: ['channels', 'list'] as const,
  one: (id: string) => ['channels', 'one', id] as const,
  options: ['channels', 'onboarding'] as const,
  prop: (id: string, prop: string) => ['channels', 'prop', id, prop] as const,
};

export const useChannels = () => useQuery({ queryKey: channelKeys.list, queryFn: () => listChannels(), staleTime: 60_000 });

export const useChannel = (id: string | undefined) =>
  useQuery({
    queryKey: channelKeys.one(id ?? ''),
    queryFn: () => getChannel(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

/** What can be added right now. An empty list means nothing this caller can connect (see `useAddChannelBlocker`). */
export const useOnboardingOptions = () => useQuery({ queryKey: channelKeys.options, queryFn: onboardingOptions, staleTime: 60_000, retry: 1 });

/**
 * Why nothing can be added, when the list is empty: the service names the
 * reason when asked for a signup link (plan, quota, role, provider not set up).
 * `null` when a link was issued after all (connectable through the active provider).
 */
export const useAddChannelBlocker = (enabled: boolean) =>
  useQuery({
    queryKey: [...channelKeys.all, 'blocker'],
    queryFn: async () => {
      try {
        await signupUrl();
        return null;
      } catch (err) {
        return describeCrmError(err);
      }
    },
    enabled,
    staleTime: 60_000,
    retry: false,
  });

export const useRefreshChannels = () => {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: channelKeys.all }), qc.invalidateQueries({ queryKey: waKeys.channels })]);
};
