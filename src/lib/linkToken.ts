/**
 * The token from an emailed verify / reset link, exactly as the server issued it.
 *
 * It arrives as `?token=…` or in the path (`/verify/<token>`), and it is base64,
 * so it may contain `/` (split into several path segments: rejoined here) and
 * `+` (read as a space from a query string: put back, base64 has no spaces).
 */
export const linkToken = (raw: string | string[] | undefined): string =>
  (Array.isArray(raw) ? raw.join('/') : (raw ?? '')).trim().replace(/ /g, '+');
