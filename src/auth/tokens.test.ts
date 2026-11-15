import { describe, expect, it } from 'vitest';
import { hashToken, isWellFormedToken, newToken } from './tokens';

describe('tokens', () => {
  it('are 32 random bytes, base64url', () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(t, 'base64url').length).toBe(32);
    expect(newToken()).not.toBe(t);
  });
  it('hash to SHA-256 hex, deterministically', () => {
    const t = newToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(hashToken(newToken()));
  });
  it('recognises well-formed tokens only', () => {
    expect(isWellFormedToken(newToken())).toBe(true);
    expect(isWellFormedToken(undefined)).toBe(false);
    expect(isWellFormedToken('')).toBe(false);
    expect(isWellFormedToken('a'.repeat(42))).toBe(false);
    expect(isWellFormedToken('a'.repeat(42) + '=')).toBe(false);
  });
});
