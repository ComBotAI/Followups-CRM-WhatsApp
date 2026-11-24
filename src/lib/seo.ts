/**
 * Web search and share metadata, shared by the root HTML (+html.tsx) and each
 * public page's `generateMetadata()`. Every page gets its own canonical URL and
 * share card; pages a link is only meant to be opened from (verify, reset) are
 * kept out of search results.
 */
import type { Metadata } from 'expo-router/server';

import { env } from '@/config/env';

/** EXPO_PUBLIC_WEB_DOMAIN in .env. */
export const SITE = env.siteUrl;
export const SITE_NAME = env.appName;
export const DEFAULT_TITLE = `${SITE_NAME} — WhatsApp CRM, leads & follow-up reminders`;
export const DEFAULT_DESCRIPTION =
  'A WhatsApp-first CRM for small businesses: contacts and leads, WhatsApp templates and campaigns, automatic follow-ups and repeat-visit reminders in one app. Android and web, in 17 languages.';
export const SHARE_IMAGE = `${SITE}/og-image.png`;
export const SHARE_IMAGE_ALT = `${SITE_NAME}: contacts, WhatsApp and follow-ups on one screen`;

/** Hints for search engines that still read them (Bing, Yandex, Baidu); Google ignores the tag. */
export const KEYWORDS = [
  'WhatsApp CRM',
  'WhatsApp follow up app',
  'follow-up reminders',
  'lead management app',
  'small business CRM',
  'customer follow up',
  'repeat customer reminders',
  'WhatsApp Business API CRM',
  'sales follow up app India',
  'salon CRM',
  'clinic patient reminders',
  'service reminder app',
  env.brandName,
];

/** The public pages: one place for their title and description (static HTML and the browser tab). */
type PublicPage = {
  title: string;
  description: string;
  /** False for pages only reached from an emailed link (verify, reset password). */
  index?: boolean;
};
export const PUBLIC_PAGES = {
  '/access': {
    title: `Sign in · ${SITE_NAME}`,
    description: `Enter your company Access ID to sign in to ${SITE_NAME}: contacts, WhatsApp and follow-ups in one app.`,
  },
  '/forgot': {
    title: `Reset your password · ${SITE_NAME}`,
    description: `Get a link to reset your ${SITE_NAME} password.`,
  },
  '/login': {
    title: `Log in · ${SITE_NAME}`,
    description: `Log in to ${SITE_NAME} to work your contacts, WhatsApp messages and follow-ups.`,
  },
  '/reset-password': {
    title: `Choose a new password · ${SITE_NAME}`,
    description: `Set a new password for your ${SITE_NAME} account.`,
    index: false,
  },
  '/verify': {
    title: `Verify your email · ${SITE_NAME}`,
    description: `Confirm your email address to finish setting up ${SITE_NAME}.`,
    index: false,
  },
} satisfies Record<string, PublicPage>;
export type PublicPath = keyof typeof PUBLIC_PAGES;

/** Metadata for one public page: its own title, description, canonical URL and share card. */
export function pageMeta(path: PublicPath): Metadata {
  const { title, description, index = true } = PUBLIC_PAGES[path] as PublicPage;
  const url = `${SITE}${path}`;
  return {
    title,
    description,
    keywords: KEYWORDS,
    alternates: { canonical: url },
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url,
      title,
      description,
      locale: 'en_IN',
      images: [{ url: SHARE_IMAGE, width: 1200, height: 630, alt: SHARE_IMAGE_ALT }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [SHARE_IMAGE] },
  };
}

/**
 * The browser tab's title for an address, as the app moves between pages in the
 * browser (the static HTML only covers the page first loaded). Signed-in sections
 * set their own (see the (app) web layout); everything else gets its public
 * page's title, or the site's.
 */
export const titleForPath = (pathname: string): string =>
  (PUBLIC_PAGES as Record<string, PublicPage>)[pathname.replace(/\/+$/, '') || '/']?.title ?? DEFAULT_TITLE;
