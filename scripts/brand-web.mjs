#!/usr/bin/env node
/**
 * Writes the brand-specific static web files from .env, so a rebrand needs no hand edits:
 *   public/manifest.webmanifest              app name, Play Store link (theme_color: edit by hand)
 *   public/.well-known/assetlinks.json       Android App Links (package + signing-key SHA-256)
 *   public/.well-known/apple-app-site-association   iOS Universal Links (team id + bundle id)
 *   public/sitemap.xml, public/robots.txt    site URL
 *   hosting/nginx.conf                       server_name
 * Runs before every `npm run build:web`; run it alone with `npm run brand:web`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const read = (key) => (process.env[key] ?? '').trim();
const appName = read('EXPO_PUBLIC_APP_NAME');
const brandName = read('EXPO_PUBLIC_BRAND_NAME') || appName;
const androidPackage = read('EXPO_PUBLIC_ANDROID_PACKAGE');
const iosBundleId = read('EXPO_PUBLIC_IOS_BUNDLE_ID') || androidPackage;
const domain = read('EXPO_PUBLIC_WEB_DOMAIN').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const teamId = read('APPLE_TEAM_ID') || 'APPLE_TEAM_ID';
const fingerprints = read('ANDROID_SHA256_CERT_FINGERPRINTS').split(',').map((s) => s.trim()).filter(Boolean);

if (!appName || !androidPackage) {
  console.error('[brand:web] EXPO_PUBLIC_APP_NAME and EXPO_PUBLIC_ANDROID_PACKAGE must be set in .env');
  process.exit(1);
}

const json = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
const patch = (path, pattern, replacement) => {
  if (!existsSync(path)) return;
  writeFileSync(path, readFileSync(path, 'utf8').replace(pattern, replacement));
};

// Web app manifest: keep everything else as it is.
const manifestPath = 'public/manifest.webmanifest';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const playUrl = `https://play.google.com/store/apps/details?id=${androidPackage}`;
json(manifestPath, {
  ...manifest,
  name: appName,
  short_name: brandName,
  related_applications: [{ platform: 'play', id: androidPackage, url: playUrl }],
});

// App Links / Universal Links: the email links that open the app.
const LINK_PATHS = ['/verify', '/reset-password'];
json('public/.well-known/assetlinks.json', [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: androidPackage, sha256_cert_fingerprints: fingerprints },
  },
]);
const appId = `${teamId}.${iosBundleId}`;
json('public/.well-known/apple-app-site-association', {
  applinks: {
    details: [
      {
        appIDs: [appId],
        components: [
          { '/': '/verify*', comment: 'Email verification' },
          { '/': '/reset-password*', comment: 'Password reset' },
        ],
      },
      { appID: appId, paths: LINK_PATHS.flatMap((p) => [p, `${p}/*`]) },
    ],
  },
  webcredentials: { apps: [appId] },
});

if (domain) {
  const site = `https://${domain}`;
  patch('public/sitemap.xml', /<loc>https?:\/\/[^/<]+/g, `<loc>${site}`);
  patch('public/robots.txt', /^Sitemap: .*$/m, `Sitemap: ${site}/sitemap.xml`);
  patch('hosting/nginx.conf', /server_name [^;]+;/, `server_name ${domain};`);
}

const warnings = [];
if (!domain) warnings.push('EXPO_PUBLIC_WEB_DOMAIN is empty: sitemap, robots.txt and nginx.conf were left as they are');
if (!fingerprints.length) warnings.push('ANDROID_SHA256_CERT_FINGERPRINTS is empty: Android App Links will not verify');
if (teamId === 'APPLE_TEAM_ID') warnings.push('APPLE_TEAM_ID is empty: iOS Universal Links will not verify');
console.log(`[brand:web] web files written for ${appName}${domain ? ` (${domain})` : ''}`);
for (const w of warnings) console.warn(`[brand:web] warning: ${w}`);
