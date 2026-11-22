import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatDuration, formatMonth } from './dates';

describe('dates', () => {
  it('writes dates and date-times the same way everywhere', () => {
    expect(formatDate(new Date('2026-11-12T14:05:00Z'))).toBe('12 Nov 2026');
    expect(formatDateTime(new Date('2026-11-12T14:05:00Z'))).toBe('12 Nov 2026, 14:05');
    expect(formatDateTime(new Date('2026-03-05T09:07:00Z'))).toBe('5 Mar 2026, 09:07');
    expect(formatDate(new Date('2026-09-16T10:00:00Z'))).toBe('16 Sep 2026');
    expect(formatMonth(new Date('2026-11-12T14:05:00Z'))).toBe('November 2026');
  });

  it('uses UK time, summer and winter', () => {
    expect(formatDateTime(new Date('2026-07-01T12:00:00Z'))).toBe('1 Jul 2026, 13:00');
    expect(formatDateTime(new Date('2026-01-01T12:00:00Z'))).toBe('1 Jan 2026, 12:00');
  });

  it('puts a call made just before midnight UTC on the right UK day in summer', () => {
    expect(formatDateTime(new Date('2026-06-30T23:30:00Z'))).toBe('1 Jul 2026, 00:30');
  });

  it('says a length of time in words', () => {
    expect(formatDuration(150)).toBe('2 min 30 s');
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(600)).toBe('10 min');
  });
});
