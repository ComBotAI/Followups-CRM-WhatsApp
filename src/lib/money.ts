/**
 * A typed amount, whatever the separators: "1,250.50", "1.250,50", "12,50",
 * "₹ 650". The last separator followed by one or two digits is the decimal
 * point; one followed by exactly three digits groups thousands ("1.250"). A
 * single separator followed by four or more digits can only be a decimal point
 * (a computed sum such as "30.299999999999997"), and is rounded to cents.
 * null when nothing usable.
 */
export const parseAmount = (raw: string): number | null => {
  const s = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const long = /^(\d*)[.,](\d{4,})$/.exec(s);
  if (long) {
    const n = Number(`${long[1] || '0'}.${long[2]}`);
    return Number.isFinite(n) ? roundCents(n) : null;
  }
  const m = /[.,](\d{1,2})$/.exec(s);
  const whole = (m ? s.slice(0, m.index) : s).replace(/[.,]/g, '');
  const n = Number(m ? `${whole || '0'}.${m[1]}` : whole);
  return Number.isFinite(n) ? n : null;
};

/** An amount rounded to two decimals (sums of prices pick up float noise: 10.1 + 20.2). */
export const roundCents = (n: number): number => Math.round(n * 100) / 100;

/** An amount in a currency, in the device's number format ("₹1,250.00"). */
/** A whole number that fits a narrow tile: 2,930 · 4,52,300 · 12.4M. */
export const formatCompact = (n: number): string => (n < 10_000_000 ? Math.round(n).toLocaleString() : `${(n / 1_000_000).toFixed(1)}M`);

export const formatMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};
