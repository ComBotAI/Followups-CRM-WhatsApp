/**
 * Starts Meta's WhatsApp signup in a browser and, when it comes back, opens the
 * confirm step.
 *
 * The signup URL is fetched ahead of the tap: a browser only lets a page open a
 * popup straight after a click, not after a network wait. It also means a plan
 * that has no room says so before anyone is sent to Meta.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import type { OnboardingReturn } from '@ab-ecosystem/cpaas';

import { claimSignupReturn, signupReturnFromUrl, signupReturnUri, signupUrl } from '@/services/crm/channels';
import { channelKeys } from '@/hooks/channels';

/** Route params from a return, leaving out the empty ones. */
export const returnParams = (r: OnboardingReturn): Record<string, string> =>
  Object.fromEntries(Object.entries(r).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''));

export function useSignup(slug: string | undefined, enabled: boolean) {
  const qc = useQueryClient();
  const key = [...channelKeys.all, 'signupUrl', slug ?? ''];
  const prepared = useQuery({ queryKey: key, queryFn: () => signupUrl(slug), enabled, staleTime: 30 * 60_000, retry: false });
  const [running, setRunning] = useState(false);

  const start = async () => {
    // Already fetched: open in the same tick as the tap.
    const url = prepared.data ?? (await signupUrl(slug));
    setRunning(true);
    try {
      const res = await WebBrowser.openAuthSessionAsync(url, signupReturnUri());
      if (res.type !== 'success') return;
      const ret = signupReturnFromUrl(res.url);
      if (ret && claimSignupReturn(ret)) router.push({ pathname: '/(app)/channels/connect', params: returnParams(ret) });
    } finally {
      setRunning(false);
      // A fresh signed state for the next attempt.
      void qc.invalidateQueries({ queryKey: key });
    }
  };

  return { start, running, ready: !!prepared.data, error: prepared.error };
}
