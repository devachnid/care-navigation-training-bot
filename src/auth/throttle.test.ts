import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '@/test/db';
import { EMAIL_LIMIT, IP_LIMIT, THROTTLE_WINDOW_MS, clearEmailThrottle, isThrottled, recordFailedSignIn } from './throttle';

beforeAll(async () => {
  await createTestDb();
});

const at = (ms: number) => new Date(Date.UTC(2026, 10, 15, 9) + ms);

describe('sign-in throttle', () => {
  it('blocks an email after 8 failures within 15 minutes', async () => {
    const email = 'eight@example.com';
    for (let i = 0; i < EMAIL_LIMIT - 1; i++) await recordFailedSignIn(email, null, at(i * 1000));
    expect(await isThrottled(email, null, at(10_000))).toBe(false);
    await recordFailedSignIn(email, null, at(11_000));
    expect(await isThrottled(email, null, at(12_000))).toBe(true);
    // Still blocked for the rest of the window, which started at the first failure.
    expect(await isThrottled(email, null, at(THROTTLE_WINDOW_MS - 1))).toBe(true);
    expect(await isThrottled(email, null, at(THROTTLE_WINDOW_MS + 1))).toBe(false);
  });

  it('starts a new window once the old one has run out', async () => {
    const email = 'window@example.com';
    for (let i = 0; i < EMAIL_LIMIT; i++) await recordFailedSignIn(email, null, at(0));
    await recordFailedSignIn(email, null, at(THROTTLE_WINDOW_MS + 1000));
    expect(await isThrottled(email, null, at(THROTTLE_WINDOW_MS + 2000))).toBe(false);
  });

  it('blocks an IP after 30 failures across different emails', async () => {
    const ip = '203.0.113.9';
    for (let i = 0; i < IP_LIMIT; i++) await recordFailedSignIn(`ip${i}@example.com`, ip, at(i));
    expect(await isThrottled('someone-new@example.com', ip, at(100))).toBe(true);
    expect(await isThrottled('someone-new@example.com', '203.0.113.10', at(100))).toBe(false);
  });

  it('clearing the email does not clear the IP', async () => {
    const ip = '198.51.100.1';
    for (let i = 0; i < IP_LIMIT; i++) await recordFailedSignIn('same@example.com', ip, at(i));
    await clearEmailThrottle('same@example.com');
    expect(await isThrottled('same@example.com', null, at(100))).toBe(false);
    expect(await isThrottled('same@example.com', ip, at(100))).toBe(true);
  });
});
