/**
 * Several open tabs share localStorage but each keeps its own copy in memory.
 *
 * - When another tab signs out of (or expires) an account this tab has open, this
 *   one would keep writing that account's data back. Reload instead, so every tab
 *   shows the same accounts.
 * - When another tab adds an account (or renames / recolours one), this tab takes
 *   it into its own list. Otherwise this tab's next write of the account list
 *   (any switch, colour change or boot) would save it without that account, and
 *   the account would be gone on the next reload. Each tab keeps its own active account.
 */
import { hydrateTokens, useAccountsStore, type AccountSession } from '@/stores/accounts';

const TOKEN_PREFIX = 'fcrm:t:';
const ACCOUNTS_KEY = 'fcrm:g:accounts';
let started = false;

const mergeAccounts = (raw: string) => {
  let theirs: AccountSession[] = [];
  try {
    theirs = (JSON.parse(raw) as { state?: { sessions?: AccountSession[] } }).state?.sessions ?? [];
  } catch {
    return;
  }
  if (!Array.isArray(theirs) || !theirs.length) return;
  const mine = useAccountsStore.getState().sessions;
  const byId = new Map(mine.map((s) => [s.id, s]));
  let added = false;
  for (const s of theirs) {
    if (!s?.id) continue;
    if (!byId.has(s.id)) added = true;
    byId.set(s.id, { ...byId.get(s.id), ...s });
  }
  const merged = [...byId.values()];
  // Nothing new: don't write (the write would echo back to the other tab as another event).
  if (JSON.stringify(merged) === JSON.stringify(mine)) return;
  useAccountsStore.setState({ sessions: merged });
  if (added) void hydrateTokens();
};

export const startTabSync = () => {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('storage', (e) => {
    if (e.key === ACCOUNTS_KEY && e.newValue) return mergeAccounts(e.newValue);
    if (!e.key?.startsWith(TOKEN_PREFIX) || e.newValue !== null) return;
    const id = e.key.slice(TOKEN_PREFIX.length);
    if (useAccountsStore.getState().sessions.some((s) => s.id === id)) window.location.reload();
  });
};
