import dayjs from 'dayjs';
import calendar from 'dayjs/plugin/calendar';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import relativeTime from 'dayjs/plugin/relativeTime';
// Every app language (zh is Simplified Chinese: zh-cn).
import 'dayjs/locale/ar';
import 'dayjs/locale/bn';
import 'dayjs/locale/de';
import 'dayjs/locale/es';
import 'dayjs/locale/fr';
import 'dayjs/locale/gu';
import 'dayjs/locale/hi';
import 'dayjs/locale/id';
import 'dayjs/locale/ja';
import 'dayjs/locale/mr';
import 'dayjs/locale/pt';
import 'dayjs/locale/ru';
import 'dayjs/locale/ta';
import 'dayjs/locale/te';
import 'dayjs/locale/ur';
import 'dayjs/locale/zh-cn';

import { i18next } from '@/i18n';

dayjs.extend(relativeTime);
dayjs.extend(calendar);
dayjs.extend(localizedFormat);

export { dayjs };

const DAYJS_LOCALE: Record<string, string> = { zh: 'zh-cn' };

/** Dates and "2 hours ago" follow the app's language. */
const followLanguage = (lng: string | undefined) => {
  const code = (lng ?? 'en').split('-')[0];
  dayjs.locale(DAYJS_LOCALE[code] ?? code);
  // An unknown code leaves dayjs where it was: fall back to English.
  if (dayjs.locale() !== (DAYJS_LOCALE[code] ?? code)) dayjs.locale('en');
};
followLanguage(i18next.language);
i18next.on('languageChanged', followLanguage);

/** `[Today]`-style literal for a dayjs format, with the brackets dayjs needs escaped away. */
const lit = (key: string, en: string) => `[${i18next.t(key, { defaultValue: en }).replace(/[[\]]/g, '')}]`;

/** `Today · 3:51 PM`, `Yesterday · 9:52 AM`, `20 Sep · 5:01 PM`, in the app's language. */
export const formatWhen = (d: Date | string | number | null | undefined): string => {
  if (!d) return '';
  const t = dayjs(d);
  if (!t.isValid()) return '';
  return t.calendar(null, {
    sameDay: `${lit('time.today', 'Today')} · LT`,
    lastDay: `${lit('time.yesterday', 'Yesterday')} · LT`,
    nextDay: `${lit('time.tomorrow', 'Tomorrow')} · LT`,
    lastWeek: 'D MMM · LT',
    nextWeek: 'D MMM · LT',
    sameElse: 'D MMM YY · LT',
  });
};

export const fromNow = (d: Date | string | number) => dayjs(d).fromNow();

/** A stored date (ISO text, or epoch seconds / milliseconds) as ISO text; '' when unset or invalid. */
export const toIso = (v: unknown): string => {
  if (!v) return '';
  const d = new Date(typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : String(v));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};

export const isOverdue = (d: Date | null) => !!d && d.getTime() < Date.now();
export const isToday = (d: Date | null) => !!d && dayjs(d).isSame(dayjs(), 'day');
