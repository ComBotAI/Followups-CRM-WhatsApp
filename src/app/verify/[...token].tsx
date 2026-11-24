/**
 * `/verify/<token>`: the same email verification page as `/verify?token=…`, for
 * sign-in servers whose emailed link carries the token in the path. Catch-all, because the token is base64 and may itself
 * contain `/`. The
 * page reads `token` from the route params either way.
 */
export { default, generateMetadata } from '../verify';
