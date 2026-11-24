/**
 * Calendar dates typed by people (birthdays, anniversaries): a day, not a
 * moment, so no time zones. Stored as `YYYY-MM-DD`, typed and shown as DD/MM/YYYY.
 *
 * The year is optional (many people give a birthday without one). A date typed
 * as DD/MM is stored with the placeholder year `NO_YEAR` (1904: a leap year, so
 * 29 Feb is valid, and old enough never to be a real birthday on a guest list).
 * Yearly occasions only ever use the day and month; `showDay` hides the
 * placeholder year again.
 */

/** Placeholder year for a date given without one. */
export const NO_YEAR = 1904;

/** True when a stored `YYYY-MM-DD` was given without a year. */
export const hasNoYear = (ymd: string): boolean => ymd.startsWith(`${NO_YEAR}-`);

/** `YYYY-MM-DD` from DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD or DD/MM (no year); '' when it isn't a real date. */
export const parseDay = (raw: string): string => {
  const s = raw.trim();
  let y = 0;
  let m = 0;
  let d = 0;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})$/.exec(s))) [d, m, y] = [Number(r[1]), Number(r[2]), NO_YEAR];
  else return '';
  const check = new Date(y, m - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** DD/MM/YYYY for a stored `YYYY-MM-DD` (DD/MM when it was given without a year; '' stays ''). */
export const showDay = (ymd: string): string => {
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!r) return '';
  return Number(r[1]) === NO_YEAR ? `${r[3]}/${r[2]}` : `${r[3]}/${r[2]}/${r[1]}`;
};
