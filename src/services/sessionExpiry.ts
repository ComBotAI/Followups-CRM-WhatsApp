/**
 * What happens when a request comes back 401 (the sign-in token expired or was
 * revoked) while the app is open.
 *
 * A single 401 is not trusted on its own: the session is checked once (`GET
 * /me`). Expired → the account's token is dropped and the sign-in screen asks
 * for the password again (its data stays, so signing back in picks up where it
 * left off). Access to the workspace removed → the "account lost" screen.
 * Anything else (offline, a one-off failure) → nothing.
 *
 * Only the account on screen is handled here; a background account with an
 * expired token is caught the next time it is opened.
 *
 * The check itself is handed in by the auth store (`configureSessionCheck`):
 * the API clients report here, and the auth store depends on those clients.
 */
import { activeAccountId, tokenFor } from '@/stores/accounts';

/** What a session check found. */
export type SessionVerdict = 'valid' | 'expired' | 'lost' | 'unknown';

type Check = {
  /** Asks the server about this token. */
  verify: (token: string) => Promise<SessionVerdict>;
  /** The account whose token was checked; it may no longer be the one on screen. */
  onExpired: (accountId: string) => void;
  onLost: (accountId: string) => void;
};

let check: Check | null = null;
export const configureSessionCheck = (c: Check) => {
  check = c;
};

let checking = false;
let lastCheck = 0;
const QUIET_MS = 15_000;

export const reportUnauthorized = (accountId: string | null | undefined) => {
  const active = activeAccountId();
  const acct = accountId ?? active;
  if (!check || !acct || acct !== active) return;
  if (checking || Date.now() - lastCheck < QUIET_MS) return;
  const token = tokenFor(acct);
  if (!token) return;
  checking = true;
  lastCheck = Date.now();
  const c = check;
  void c
    .verify(token)
    .then((verdict) => {
      // The user may have switched account while the check ran: act only on the one checked, if still on screen.
      if (activeAccountId() !== acct) return;
      if (verdict === 'expired') c.onExpired(acct);
      else if (verdict === 'lost') c.onLost(acct);
    })
    .catch(() => undefined)
    .finally(() => {
      checking = false;
    });
};

/** A fetch that reports 401s, for an API client bound to one account (`null` = whichever is on screen). */
/** How long a 429 asks to wait: the gateway's exact `details.retryAfterMs`, else `Retry-After`, else 1s. */
const retryAfterMs = async (res: Response): Promise<number> => {
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as { error?: { details?: { retryAfterMs?: number } }; details?: { retryAfterMs?: number } } | null;
  const exact = body?.error?.details?.retryAfterMs ?? body?.details?.retryAfterMs;
  if (typeof exact === 'number' && exact >= 0) return exact;
  const header = Number(res.headers.get('retry-after'));
  return Number.isFinite(header) && header > 0 ? header * 1000 : 1000;
};

const wait = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

/** Store-full warnings already shown, per account, this run: once is enough. */
const warnedFull = new Set<string>();
const warnStoreFull = async (res: Response, acct: string | null) => {
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as { error?: { code?: string }; code?: string } | null;
  if ((body?.error?.code ?? body?.code) !== 'storage_exceeded' || warnedFull.has(acct ?? '')) return;
  warnedFull.add(acct ?? '');
  const [{ showAlert }, { i18next }] = await Promise.all([import('@/lib/dialog'), import('@/i18n')]);
  showAlert(i18next.t('datastore.fullTitle'), i18next.t('datastore.fullBody'));
};

export const watchedFetch =
  (accountId: () => string | null): typeof fetch =>
  async (input, init) => {
    let res = await globalThis.fetch(input, init);
    // Rate limited by the data store plan: wait as told and try again (twice at most, never long).
    for (let attempt = 0; res.status === 429 && attempt < 2; attempt++) {
      await wait(Math.min(await retryAfterMs(res), 15_000), init?.signal);
      res = await globalThis.fetch(input, init);
    }
    if (res.status === 401) reportUnauthorized(accountId());
    if (res.status === 402) void warnStoreFull(res, accountId()).catch(() => undefined);
    return res;
  };
