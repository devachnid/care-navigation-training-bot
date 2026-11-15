import { describe, expect, it } from 'vitest';
import { callClock, describeLimit, formatClock } from './limit';

describe('callClock', () => {
  it('is quiet until one minute before the limit', () => {
    expect(callClock(0, 600)).toEqual({ remainingSeconds: 600, warn: false, expired: false });
    expect(callClock(539, 600)).toMatchObject({ warn: false, expired: false, remainingSeconds: 61 });
  });

  it('warns from 9:00 of 10:00 until the limit', () => {
    expect(callClock(540, 600)).toEqual({ remainingSeconds: 60, warn: true, expired: false });
    expect(callClock(599, 600)).toEqual({ remainingSeconds: 1, warn: true, expired: false });
  });

  it('expires at the limit and not before, with no warning once expired', () => {
    expect(callClock(600, 600)).toEqual({ remainingSeconds: 0, warn: false, expired: true });
    expect(callClock(900, 600)).toEqual({ remainingSeconds: 0, warn: false, expired: true });
  });

  it('follows a different limit', () => {
    expect(callClock(100, 180)).toMatchObject({ warn: false });
    expect(callClock(120, 180)).toMatchObject({ warn: true });
    expect(callClock(180, 180)).toMatchObject({ expired: true });
  });

  it('warns straight away when the whole limit is a minute or less', () => {
    expect(callClock(0, 45)).toMatchObject({ warn: true, expired: false });
  });
});

describe('formatClock', () => {
  it('formats minutes and padded seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(-3)).toBe('0:00');
    expect(formatClock(59.9)).toBe('0:59');
  });
});

describe('describeLimit', () => {
  it('says the limit in words', () => {
    expect(describeLimit(600)).toBe('10 minutes');
    expect(describeLimit(60)).toBe('1 minute');
    expect(describeLimit(210)).toBe('3 minutes 30 seconds');
    expect(describeLimit(45)).toBe('45 seconds');
  });
});
