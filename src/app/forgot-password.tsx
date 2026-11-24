import { Redirect } from 'expo-router';
import type { Metadata } from 'expo-router/server';

import { pageMeta } from '@/lib/seo';

/** The sign-in server's default "forgot password" path: the app's own screen. */
/** Web: this page's title and description for search and link previews. */
export function generateMetadata(): Metadata {
  return pageMeta('/forgot');
}

export default function ForgotPasswordAlias() {
  return <Redirect href="/(auth)/forgot" />;
}
