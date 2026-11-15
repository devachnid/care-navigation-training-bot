'use server';

import { redirect } from 'next/navigation';
import { clearSessionCookie, readSessionToken } from '@/auth/next-cookies';
import { signOut } from '@/auth/sign-in';

/**
 * The sign-out form in `AppShell`. Needs no ability: ending your own session is always allowed.
 * Safe to call when already signed out.
 */
export async function signOutAction(): Promise<void> {
  await signOut(await readSessionToken());
  await clearSessionCookie();
  redirect('/sign-in');
}
