/**
 * Back navigation that never dead-ends. After a page refresh or a deep link
 * there may be no history, so `router.back()` does nothing; we
 * then go to a sensible screen instead (the app home by default).
 */
import { router, type Href } from 'expo-router';

/** The index route sends each account to its own home tab. */
export const HOME: Href = '/';

export const goBack = (fallback: Href = HOME) => {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
};
