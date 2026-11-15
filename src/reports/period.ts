/** The time windows the reports page offers. */
export const PERIODS = ['30d', '90d', 'all'] as const;
export type Period = (typeof PERIODS)[number];

export const DEFAULT_PERIOD: Period = '30d';

export const PERIOD_LABEL: Record<Period, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
};

const DAYS: Record<Exclude<Period, 'all'>, number> = { '30d': 30, '90d': 90 };

/**
 * The `?period=` value from a URL. Anything we do not know (missing, misspelt, repeated with a
 * strange first value) is the default, 30 days, so a bad link still shows a page.
 */
export function parsePeriod(value: string | string[] | null | undefined): Period {
  const first = Array.isArray(value) ? value[0] : value;
  return (PERIODS as readonly string[]).includes(first ?? '') ? (first as Period) : DEFAULT_PERIOD;
}

/**
 * The earliest start time that counts, or null for "all time". A call that started exactly at the
 * start time is inside the period (the boundary is inclusive).
 */
export function periodStart(period: Period, now: Date = new Date()): Date | null {
  if (period === 'all') return null;
  return new Date(now.getTime() - DAYS[period] * 24 * 60 * 60 * 1000);
}
