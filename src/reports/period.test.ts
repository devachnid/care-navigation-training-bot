import { describe, expect, it } from 'vitest';
import { DEFAULT_PERIOD, parsePeriod, periodStart } from './period';

describe('parsePeriod', () => {
  it('accepts the three known values', () => {
    expect(parsePeriod('30d')).toBe('30d');
    expect(parsePeriod('90d')).toBe('90d');
    expect(parsePeriod('all')).toBe('all');
  });

  it('falls back to 30 days for anything else', () => {
    for (const v of [undefined, null, '', '7d', 'ALL', '30D', '30d ', 'forever', '__proto__']) {
      expect(parsePeriod(v)).toBe(DEFAULT_PERIOD);
    }
    expect(DEFAULT_PERIOD).toBe('30d');
  });

  it('uses the first value when the parameter is repeated', () => {
    expect(parsePeriod(['90d', 'all'])).toBe('90d');
    expect(parsePeriod(['nonsense', 'all'])).toBe('30d');
    expect(parsePeriod([])).toBe('30d');
  });
});

describe('periodStart', () => {
  const now = new Date('2026-11-15T12:00:00Z');

  it('is exactly 30 or 90 days before now', () => {
    expect(periodStart('30d', now)?.toISOString()).toBe('2026-10-16T12:00:00.000Z');
    expect(periodStart('90d', now)?.toISOString()).toBe('2026-08-17T12:00:00.000Z');
  });

  it('is none for all time', () => {
    expect(periodStart('all', now)).toBeNull();
  });
});
