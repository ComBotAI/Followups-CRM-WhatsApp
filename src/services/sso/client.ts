/**
 * Native client for the partner-ecosystem Auth-as-a-Service API.
 *
 * Why this exists: `@ab-ecosystem/sso` ships React DOM screens (react-dom,
 * localStorage, Tailwind) and exports no plain `login` / `signup` / `verify-2fa`
 * functions, so it cannot run inside React Native. Every endpoint, body and
 * response branch below was taken from the package's compiled source, and the
 * package's own TypeScript types are reused (type-only imports erase at build
 * time, so none of its DOM code is bundled).
 *
 * Base path: `${ssoUrl}/api/v1/projects/${projectId}`.
 */
import type {
  AccountContext,
  AccountOption,
  AuthConfig,
  AuthResponse,
  CreateRolePayload,
  LoginRequest,
  MappedProfile,
  Member,
  MemberStatus,
  PermissionAction,
  PermissionCatalogue,
  Role,
  TeamMember,
  UpdateMemberPayload,
  UpdateRolePayload,
  VerifyTwoFactorRequest,
} from '@ab-ecosystem/sso';

import { Platform } from 'react-native';

import { env } from '@/config/env';
import { accessIdForToken, getAuthAccessId } from '@/services/accessId';
import { reportUnauthorized } from '@/services/sessionExpiry';
import { tokenFor, useAccountsStore } from '@/stores/accounts';

/** Which signed-in account a token belongs to (only the one on screen is acted on). */
const accountForToken = (token: string) => useAccountsStore.getState().sessions.find((x) => tokenFor(x.id) === token)?.id ?? null;
/** A 401 for a token no signed-in account holds (one being signed in, or already dropped) says nothing about the others. */
const reportTokenUnauthorized = (token: string) => {
  const id = accountForToken(token);
  if (id) reportUnauthorized(id);
};

export class SsoError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'SsoError';
    this.status = status;
    this.code = code;
  }
  /** Revoked / expired access to *this* account (A403). The login is still valid. */
  get isAccountAccessLost() {
    return this.code === 'A403' || (this.status === 401 && /account (access (revoked|expired)|disabled|not found|does not belong)/i.test(this.message));
  }
}

type Envelope<T = unknown> = {
  success?: boolean;
  message?: string;
  code?: string;
  data?: T;
};

/** The Access ID (project id) for a call: the token's account, else the sign-in flow's. */
const base = (token?: string, accessId?: string) => `${env.ssoUrl}/api/v1/projects/${encodeURIComponent(accessId || accessIdForToken(token))}`;

/**
 * SSO checks the `Origin` against the project's allowed origins (even for the
 * public auth-config). Browsers set the header themselves; React Native sends
 * none, so the app sends `http://localhost` off the web.
 */
const originHeaders = (): Record<string, string> => (Platform.OS === 'web' ? {} : { Origin: env.appOrigin, Referer: `${env.appOrigin}/` });

const headers = (token?: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  ...originHeaders(),
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

/** SSO calls give up after this: a stalled network must not hold the splash screen or sign-out. */
const SSO_TIMEOUT_MS = 15_000;
const timedFetch = (url: string, init: RequestInit = {}, ms = SSO_TIMEOUT_MS): Promise<Response> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('The server took too long to answer')), ms);
  // A caller's own signal still cancels.
  init.signal?.addEventListener('abort', () => ctrl.abort(init.signal?.reason), { once: true });
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

/**
 * Generic request. Mirrors the package's `request()` helper: a non-2xx status or
 * `{ success: false }` throws, otherwise the `data` member is returned when the
 * envelope has one.
 */
async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  let res: Response;
  try {
    res = await timedFetch(`${base(token)}${path}`, {
      ...rest,
      headers: { ...headers(token), ...(rest.headers ?? {}) },
    });
  } catch (err) {
    throw new SsoError(err instanceof Error ? `Network error: ${err.message}` : 'Network error');
  }
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok || body?.success === false) {
    // A signed-in call refused as unauthenticated: the token may have expired (checked once, not trusted blindly).
    if (res.status === 401 && token) reportTokenUnauthorized(token);
    throw new SsoError(body?.message || `Request failed (${res.status})`, res.status, body?.code);
  }
  return (body?.data ?? body) as T;
}

/** For other SSO modules (billing): the same signed-in request. */
export const ssoRequest = <T>(path: string, init: RequestInit & { token?: string } = {}) => request<T>(path, init);

/** Raw variant for the auth endpoints whose top-level envelope matters (2FA / account picker branches). */
async function requestRaw<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  let res: Response;
  try {
    res = await timedFetch(`${base(token)}${path}`, {
      ...rest,
      headers: { ...headers(token), ...(rest.headers ?? {}) },
    });
  } catch (err) {
    throw new SsoError(err instanceof Error ? `Network error: ${err.message}` : 'Network error');
  }
  const body = (await res.json().catch(() => null)) as (T & Envelope) | null;
  if (res.status === 401 && token) reportTokenUnauthorized(token);
  if (!res.ok) throw new SsoError(body?.message || `Request failed (${res.status})`, res.status, body?.code);
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body),
});

/* ------------------------------------------------------------------ */
/* Public, unauthenticated                                             */
/* ------------------------------------------------------------------ */

const configCache = new Map<string, AuthConfig>();
/**
 * Public project config (logo, card layout, captcha). Also how an Access ID is
 * validated: an unknown id answers 404.
 */
export const getAuthConfig = async (accessId: string = getAuthAccessId()): Promise<AuthConfig> => {
  const hit = configCache.get(accessId);
  if (hit) return hit;
  let res: Response;
  try {
    res = await timedFetch(`${base(undefined, accessId)}/auth-config`, { headers: headers() });
  } catch (err) {
    throw new SsoError(err instanceof Error ? `Network error: ${err.message}` : 'Network error');
  }
  if (!res.ok) throw new SsoError(res.status === 404 ? 'Unknown Access ID' : `Failed to fetch auth config (${res.status})`, res.status);
  const config = (await res.json()) as AuthConfig;
  configCache.set(accessId, config);
  return config;
};

/**
 * `POST /auth/login`. Three branches, checked in this order by the caller:
 * `twoFactorRequired` → `accountSelectionRequired` → `data.accessToken`.
 */
export const login = (body: LoginRequest) => requestRaw<AuthResponse>('/auth/login', json(body));

/** `POST /auth/verify-2fa`. The OTP travels as `twoFactorToken`. Same branches as login. */
export const verifyTwoFactor = (body: VerifyTwoFactorRequest) => requestRaw<AuthResponse>('/auth/verify-2fa', json(body));

/** `POST /auth/select-account`. Unauthenticated: the 5-minute ticket is the credential. */
export const selectAccount = async (selectionTicket: string, accountId: string): Promise<string> => {
  const res = await requestRaw<AuthResponse>(
    '/auth/select-account',
    json({
      selection_ticket: selectionTicket,
      account_id: accountId,
      client: env.ssoClientLabel,
    }),
  );
  return readAccessToken(res);
};

export const forgotPassword = (email: string, captchaToken?: string) => requestRaw<Envelope>('/auth/forgot-password', json({ email, captchaToken }));

export const resetPassword = (token: string, password: string, captchaToken?: string) =>
  requestRaw<Envelope>('/auth/reset-password', json({ token, password, captchaToken }));

export const verifyEmail = (token: string, captchaToken?: string) => requestRaw<Envelope>('/auth/verify-email', json({ token, captchaToken }));

/** Reads `accessToken` out of any envelope shape the auth endpoints return. */
export const readAccessToken = (res: unknown): string => {
  const r = (res ?? {}) as {
    data?: { accessToken?: unknown };
    accessToken?: unknown;
    token?: unknown;
  };
  const nested = r.data?.accessToken;
  if (typeof nested === 'string' && nested) return nested;
  if (typeof r.accessToken === 'string' && r.accessToken) return r.accessToken;
  if (typeof r.token === 'string' && r.token) return r.token;
  return '';
};

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

type RawMe = {
  id?: string;
  username?: string;
  /** When the login was created (the server sends one of these). */
  createdAt?: string | number;
  created_at?: string | number;
  created_on?: string | number;
  profile?: {
    name?: { first?: string; last?: string };
    email?: string;
    phone_number?: { number?: string };
    whatsapp?: { number?: string; verified?: boolean };
    address?: {
      city?: string;
      state?: string;
      country?: string;
      code?: string;
    };
    timezone?: string;
    language?: string;
    profile_picture?: string;
  };
  mainWallet?: MappedProfile['mainWallet'];
  coinWallet?: MappedProfile['coinWallet'];
  context?: {
    account_id?: string;
    accountId?: string;
    act?: string;
    role?: { id?: string; title?: string; version?: number } | null;
    permission?: unknown;
    access_expiry?: string | null;
    account_name?: string;
    accountName?: string;
    account_email?: string;
    accountEmail?: string;
  };
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export const mapProfile = (raw: RawMe): MappedProfile => {
  const p = raw.profile ?? {};
  return {
    id: str(raw.id),
    username: str(raw.username),
    firstName: str(p.name?.first),
    lastName: str(p.name?.last),
    email: str(p.email) || str(raw.username),
    phone: str(p.phone_number?.number),
    whatsapp: str(p.whatsapp?.number),
    whatsappVerified: !!p.whatsapp?.verified,
    city: str(p.address?.city),
    state: str(p.address?.state),
    country: str(p.address?.country),
    zip: str(p.address?.code),
    timezone: str(p.timezone),
    language: str(p.language) || 'en',
    emailVerified: !!(str(p.email) || str(raw.username)),
    avatarUrl: str(p.profile_picture) || undefined,
    mainWallet: raw.mainWallet,
    coinWallet: raw.coinWallet,
  };
};

const MEMBER_ACTS = ['member', 'user'];

/** Pulls the account context out of `/me`. `null` ⇒ treat as owner (pre-member backend). */
export const mapAccountContext = (raw: RawMe): AccountContext | null => {
  const c = raw.context;
  if (!c || typeof c !== 'object') return null;
  const act = str(c.act);
  const role =
    c.role && typeof c.role === 'object'
      ? {
          id: str(c.role.id),
          title: str(c.role.title),
          version: c.role.version,
        }
      : null;
  return {
    accountId: str(c.account_id) || str(c.accountId),
    act,
    isOwner: !MEMBER_ACTS.includes(act.toLowerCase()),
    role: role && (role.id || role.title) ? role : null,
    permission: Array.isArray(c.permission) ? c.permission.filter((x): x is string => typeof x === 'string') : [],
    accessExpiry: typeof c.access_expiry === 'string' ? c.access_expiry : null,
    accountName: str(c.account_name) || str(c.accountName),
    accountEmail: str(c.account_email) || str(c.accountEmail),
  };
};

/** ISO date the login was created, or '' when the server doesn't say. */
const createdAtOf = (raw: RawMe): string => {
  const v = raw.createdAt ?? raw.created_at ?? raw.created_on;
  if (v === undefined || v === null || v === '') return '';
  // Epoch numbers: seconds or milliseconds.
  const n = typeof v === 'number' ? v : /^\d+$/.test(v) ? Number(v) : NaN;
  const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};

export type Me = { profile: MappedProfile; context: AccountContext | null; createdAt: string };

/** `GET /me` → profile + account context in one call. */
export const getMe = async (token: string): Promise<Me> => {
  const raw = await request<RawMe>('/me', { method: 'GET', token });
  return { profile: mapProfile(raw), context: mapAccountContext(raw), createdAt: createdAtOf(raw) };
};

/**
 * `PUT /profile`: changes the signed-in person's name. The endpoint takes the
 * whole profile (as the SSO settings modal sends it), so everything else is
 * read fresh from `/me` and sent back as it is: only the name changes.
 */
export const updateProfileName = async (token: string, firstName: string, lastName: string): Promise<Me> => {
  const raw = await request<RawMe>('/me', { method: 'GET', token });
  const p = raw.profile ?? {};
  await request('/profile', {
    method: 'PUT',
    token,
    body: JSON.stringify({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      // Only a real email: a login made with a phone number has none, and its username is not one.
      email: str(p.email),
      address: { city: str(p.address?.city), state: str(p.address?.state), country: str(p.address?.country), code: str(p.address?.code) },
      timezone: str(p.timezone),
      language: str(p.language) || 'en',
      phone_number: { number: str(p.phone_number?.number) },
    }),
  });
  // The profile just read, with the new name: no second /me.
  const updated: RawMe = { ...raw, profile: { ...p, name: { first: firstName.trim(), last: lastName.trim() } } };
  return { profile: mapProfile(updated), context: mapAccountContext(updated), createdAt: createdAtOf(updated) };
};

export const logout = async (token: string) => {
  try {
    await timedFetch(
      `${base(token)}/auth/logout`,
      {
        method: 'POST',
        headers: headers(token),
      },
      5_000,
    );
  } catch {
    // Always complete logout client-side; the server call is best effort.
  }
};

/** Owners pass everything; members need the key (case-insensitive). No context ⇒ unrestricted. */
export const hasPermission = (ctx: AccountContext | null | undefined, permission: string): boolean => {
  if (!ctx || ctx.isOwner) return true;
  const key = permission.trim().toUpperCase();
  return ctx.permission.some((p) => p.toUpperCase() === key);
};

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export const listAccounts = (token: string) => request<AccountOption[]>('/accounts', { method: 'GET', token });

/**
 * The tenure (billing cycle) the account's main plan is on, e.g. "30D", read
 * from `GET /subscription` the way the package's own mapper does
 * (`validity`, then `duration`, then `billingCycle`). Null when it names none.
 */
export const getSubscriptionTenure = async (token: string): Promise<string | null> => {
  const raw = await request<unknown>('/subscription', { method: 'GET', token });
  const outer = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = (outer.data && typeof outer.data === 'object' ? outer.data : outer) as Record<string, unknown>;
  for (const v of [d.validity, d.duration, d.billingCycle]) {
    if (typeof v === 'number' && v > 0) return `${v}D`;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
};

export const switchAccount = async (token: string, accountId: string): Promise<string> => {
  const res = await requestRaw<AuthResponse>('/auth/switch-account', {
    ...json({ account_id: accountId }),
    token,
  });
  const next = readAccessToken(res);
  if (!next) throw new SsoError('No access token in the response');
  return next;
};

/* ------------------------------------------------------------------ */
/* Team administration (owner) and team view (member)                  */
/* ------------------------------------------------------------------ */

export const listMembers = (token: string, status: MemberStatus = 'active') =>
  request<Member[]>(`/account/members?status=${status}`, {
    method: 'GET',
    token,
  });

/** Owner only. Partial: `role: null` removes the member's role; omitted fields stay as they are. */
export const updateMember = (token: string, memberId: string, payload: UpdateMemberPayload) =>
  request<unknown>(`/account/members/${encodeURIComponent(memberId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    token,
  });

export const revokeMember = (token: string, memberId: string) =>
  request<unknown>(`/account/members/${encodeURIComponent(memberId)}`, {
    method: 'DELETE',
    token,
  });

type RawTeamMember = {
  id?: string;
  _id?: string;
  user_id?: string;
  name?: string;
  email?: string;
  role?: { id?: string; title?: string } | string | null;
  is_owner?: boolean;
  status?: string;
  access_expiry?: string | null;
  joined_at?: string;
};

const mapTeamMember = (r: RawTeamMember): TeamMember & { userId: string } => ({
  id: str(r.id) || str(r._id) || str(r.user_id),
  /** The person's login id (what visits and assignments store), when the row gives one. */
  userId: str(r.user_id) || str(r.id) || str(r._id),
  name: str(r.name),
  email: str(r.email),
  roleTitle: typeof r.role === 'string' ? r.role : str(r.role?.title),
  roleId: typeof r.role === 'object' && r.role ? str(r.role.id) : '',
  isOwner: !!r.is_owner,
  status: str(r.status),
  accessExpiry: typeof r.access_expiry === 'string' ? r.access_expiry : null,
  joinedAt: str(r.joined_at),
});

/** `GET /account/team` — colleagues, for a member. */
export const listTeam = async (token: string): Promise<(TeamMember & { userId: string })[]> => {
  const rows = await request<RawTeamMember[]>('/account/team', {
    method: 'GET',
    token,
  });
  return (Array.isArray(rows) ? rows : []).map(mapTeamMember);
};

export const listRoles = async (token: string): Promise<Role[]> => {
  const rows = await request<Role[]>('/account/roles', { method: 'GET', token });
  return Array.isArray(rows) ? rows : [];
};

/** Owner only. `permission` must be action keys, already expanded (see `expandPermissions`). */
export const createRole = (token: string, payload: CreateRolePayload) => request<{ id: string }>('/account/roles', { ...json(payload), token });

/** Partial; `permission` replaces the whole array. Omit `data_scope` to leave it alone. */
export const updateRole = (token: string, roleId: string, payload: UpdateRolePayload) =>
  request<unknown>(`/account/roles/${encodeURIComponent(roleId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    token,
  });

/** Refused while any member still holds the role. */
export const deleteRole = (token: string, roleId: string) =>
  request<unknown>(`/account/roles/${encodeURIComponent(roleId)}`, {
    method: 'DELETE',
    token,
  });

export const getPermissions = (token: string) =>
  request<PermissionCatalogue>('/account/permissions', {
    method: 'GET',
    token,
  });

/** Every action in the catalogue, by key. */
export const indexActions = (catalogue: PermissionCatalogue | null | undefined): Map<string, PermissionAction> => {
  const map = new Map<string, PermissionAction>();
  for (const g of catalogue?.groups ?? []) for (const f of g.features) for (const a of f.actions) map.set(a.key, a);
  return map;
};

/**
 * Closes a set of action keys over `implies`, transitively. This is what a role
 * must be saved with: the server stores exactly what it is sent. Keys missing
 * from the catalogue are kept; the server names anything unknown.
 */
export const expandPermissions = (catalogue: PermissionCatalogue | null | undefined, keys: Iterable<string>): string[] => {
  const index = indexActions(catalogue);
  const out = new Set<string>();
  const stack = [...keys];
  while (stack.length) {
    const k = stack.pop()!;
    if (!k || out.has(k)) continue;
    out.add(k);
    for (const next of index.get(k)?.implies ?? []) if (!out.has(next)) stack.push(next);
  }
  return [...out];
};

/**
 * The reverse, for editing a stored role: drops keys that another kept key
 * already implies, so only what the owner actually picked stays tickable.
 */
export const minimalPermissions = (catalogue: PermissionCatalogue | null | undefined, keys: Iterable<string>): string[] => {
  const index = indexActions(catalogue);
  const all = [...new Set(keys)];
  const keep = new Set(all);
  for (const k of all) {
    if (!keep.has(k)) continue;
    for (const implied of expandPermissions(catalogue, index.get(k)?.implies ?? [])) {
      // A cycle back to k itself must not drop k.
      if (implied !== k) keep.delete(implied);
    }
  }
  return all.filter((k) => keep.has(k));
};

/**
 * One normalised "teammate" shape for the UI, whichever side of the account
 * the caller is on. `userId` is what contact assignment writes to
 * `contact.agent` (see `assignment.ts`).
 */
export type Teammate = {
  /** Membership id (owner view) or row id (member view). */
  id: string;
  /** The person's login / profile id. */
  userId: string;
  name: string;
  email: string;
  roleTitle: string;
  /** The member's role id (owner view), for changing it. */
  roleId?: string;
  isOwner: boolean;
  status: string;
  accessExpiry: string | null;
};

export const listTeammates = async (token: string, isOwner: boolean, self?: { id: string; name: string; email: string }): Promise<Teammate[]> => {
  const rows: Teammate[] = [];
  if (isOwner) {
    const members = await listMembers(token, 'active');
    for (const m of members) {
      rows.push({
        id: m.id,
        userId: m.user_id || m.id,
        name: m.name || m.email || 'Member',
        email: m.email ?? '',
        roleTitle: m.role?.title ?? '',
        roleId: m.role?.id ?? '',
        isOwner: false,
        status: m.status ?? 'active',
        accessExpiry: m.access_expiry ?? null,
      });
    }
    if (self)
      rows.unshift({
        id: self.id,
        userId: self.id,
        name: self.name,
        email: self.email,
        roleTitle: 'Owner',
        isOwner: true,
        status: 'active',
        accessExpiry: null,
      });
  } else {
    const team = await listTeam(token);
    for (const t of team) {
      rows.push({
        id: t.id,
        userId: t.userId,
        name: t.name || t.email || 'Member',
        email: t.email,
        roleTitle: t.roleTitle,
        isOwner: t.isOwner,
        status: t.status,
        accessExpiry: t.accessExpiry,
      });
    }
  }
  return rows;
};
