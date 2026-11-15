/** Session cookie rules (design section 5). Pure, so they are testable without Next. */

export function sessionCookieName(nodeEnv: string | undefined = process.env.NODE_ENV): string {
  return nodeEnv === 'production' ? '__Host-cn_session' : 'cn_session';
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Always secure; browsers treat http://localhost as secure for this purpose.
    secure: true,
    path: '/',
    expires: expiresAt,
  };
}
