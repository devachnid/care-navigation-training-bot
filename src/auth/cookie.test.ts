import { describe, expect, it } from 'vitest';
import { sessionCookieName, sessionCookieOptions } from './cookie';

describe('session cookie', () => {
  it('uses the __Host- prefix in production only', () => {
    expect(sessionCookieName('production')).toBe('__Host-cn_session');
    expect(sessionCookieName('development')).toBe('cn_session');
    expect(sessionCookieName('test')).toBe('cn_session');
  });
  it('is httpOnly, sameSite=lax, secure, whole-site, no domain, and ends with the session', () => {
    const expiresAt = new Date('2026-11-15T22:00:00Z');
    expect(sessionCookieOptions(expiresAt)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      expires: expiresAt,
    });
  });
});
