import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '@/test/db';
import {
  EMAIL_LIMIT,
  IP_LIMIT,
  PAIR_LIMIT,
  SETUP_LIMIT,
  THROTTLE_WINDOW_MS,
  clearSignInAttempts,
  countSetupAttempt,
  countSignInAttempt,
} from './throttle';

beforeAll(async () => {
  await createTestDb();
});

const at = (ms: number) => new Date(Date.UTC(2026, 10, 15, 9) + ms);

async function attempts(n: number, email: (i: number) => string, ip: (i: number) => string | null, when = at(0)) {
  const allowed: boolean[] = [];
  for (let i = 0; i < n; i++) allowed.push(await countSignInAttempt(email(i), ip(i), when));
  return allowed;
}

describe('sign-in throttle (counted before the password is checked)', () => {
  it('allows 8 attempts per email and IP in 15 minutes, then refuses for the rest of the window', async () => {
    const allowed = await attempts(PAIR_LIMIT + 1, () => 'pair@example.com', () => '192.0.2.1');
    expect(allowed).toEqual([...Array(PAIR_LIMIT).fill(true), false]);
    expect(await countSignInAttempt('pair@example.com', '192.0.2.1', at(THROTTLE_WINDOW_MS - 1))).toBe(false);
    // The window started at the first attempt; after it, a new one starts.
    expect(await countSignInAttempt('pair@example.com', '192.0.2.1', at(THROTTLE_WINDOW_MS + 1))).toBe(true);
  });

  it('guesses from other addresses do not lock the real person out', async () => {
    await attempts(PAIR_LIMIT * 2, () => 'victim@example.com', i => `10.0.0.${i}`);
    expect(await countSignInAttempt('victim@example.com', '192.168.1.1', at(1000))).toBe(true);
  });

  it('with no IP, the limit of 8 applies to the email alone', async () => {
    const allowed = await attempts(PAIR_LIMIT + 1, () => 'noip@example.com', () => null);
    expect(allowed.filter(Boolean)).toHaveLength(PAIR_LIMIT);
  });

  it('a per-email backstop of 100 per window stops guessing spread across many addresses', async () => {
    const allowed = await attempts(EMAIL_LIMIT + 1, () => 'spread@example.com', i => `172.16.${i >> 8}.${i & 255}`);
    expect(allowed.slice(0, EMAIL_LIMIT).every(Boolean)).toBe(true);
    expect(allowed[EMAIL_LIMIT]).toBe(false);
  });

  it('30 attempts per IP across different emails', async () => {
    const allowed = await attempts(IP_LIMIT + 1, i => `ip${i}@example.com`, () => '203.0.113.9');
    expect(allowed.filter(Boolean)).toHaveLength(IP_LIMIT);
    expect(await countSignInAttempt('fresh@example.com', '203.0.113.10', at(10))).toBe(true);
  });

  it('concurrent attempts cannot get past the limit: each one is counted atomically first', async () => {
    const allowed = await Promise.all(Array.from({ length: 50 }, () => countSignInAttempt('race@example.com', null, at(0))));
    expect(allowed.filter(Boolean)).toHaveLength(PAIR_LIMIT);
  });

  it('clearing after a successful sign-in resets the email and IP pair only', async () => {
    await attempts(PAIR_LIMIT, () => 'clear@example.com', () => '198.51.100.1');
    await clearSignInAttempts('clear@example.com', '198.51.100.1');
    expect(await countSignInAttempt('clear@example.com', '198.51.100.1', at(10))).toBe(true);
  });
});

describe('setup throttle', () => {
  it('allows 5 attempts per 15 minutes under one fixed key', async () => {
    const allowed: boolean[] = [];
    for (let i = 0; i < SETUP_LIMIT + 1; i++) allowed.push(await countSetupAttempt(at(i)));
    expect(allowed).toEqual([...Array(SETUP_LIMIT).fill(true), false]);
    expect(await countSetupAttempt(at(THROTTLE_WINDOW_MS + 10))).toBe(true);
  });
});
