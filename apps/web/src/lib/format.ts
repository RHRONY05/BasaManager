/**
 * Formats integer poisha (100 poisha = 1 Taka) into a Bangladeshi Taka string.
 * Uses en-IN grouping (e.g. ৳12,500, ৳1,25,000, ৳1,25,00,000).
 * Displays whole taka unless there is a non-zero poisha remainder (then 2 decimals).
 * Negative values use U+2212 minus sign: −৳12,500.
 */
export function formatMoney(poisha: number | bigint): string {
  const isNegative = poisha < 0;
  const absVal =
    typeof poisha === 'bigint'
      ? poisha < 0n
        ? -poisha
        : poisha
      : Math.abs(poisha);

  const poishaRemainder =
    typeof absVal === 'bigint'
      ? absVal % 100n
      : Math.round(absVal % 100);

  const hasDecimals = poishaRemainder > 0;
  const takaAmount =
    typeof absVal === 'bigint'
      ? hasDecimals
        ? Number(absVal) / 100
        : absVal / 100n
      : absVal / 100;

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(takaAmount);

  const sign = isNegative ? '\u2212' : '';
  return `${sign}৳${formatted}`;
}

/**
 * Formats date into '10 Nov 2026' in Asia/Dhaka.
 */
export function formatDate(date: string | Date | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Formats month into 'November 2026' in Asia/Dhaka.
 */
export function formatMonth(date: string | Date | number): string {
  let d: Date;
  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}$/.test(date)) {
      d = new Date(`${date}-01T00:00:00Z`);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      d = new Date(`${date}T00:00:00Z`);
    } else {
      d = new Date(date);
    }
  } else {
    d = typeof date === 'number' ? new Date(date) : date;
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    month: 'long',
    year: 'numeric',
  }).format(d);
}
