import 'server-only';
import { cookies } from 'next/headers';
import { sessionCookieName, sessionCookieOptions } from './cookie';

/** The session token from the request cookie, if any. Works anywhere on the server. */
export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(sessionCookieName())?.value ?? null;
}

/** Server actions and route handlers only (Next refuses to set cookies while rendering). */
export async function writeSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, sessionCookieOptions(expiresAt));
}

/** Server actions and route handlers only. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  // Same attributes as when it was set, so the browser matches and removes it.
  store.set(sessionCookieName(), '', { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
}
