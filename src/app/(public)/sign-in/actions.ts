'use server';

import { redirect } from 'next/navigation';
import { clearSessionCookie, readSessionToken, writeSessionCookie } from '@/auth/next-cookies';
import { SIGN_IN_FAILED, signIn, signOut } from '@/auth/sign-in';
import { clientIp } from '@/app/_lib/request';
import { failed, text, type FormState } from '@/app/_lib/form';

/** Public: there is no actor yet. Signs in, replacing any session this browser already had. */
export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, 'email');
  const password = text(formData, 'password');
  if (!email.trim() || !password) {
    return failed(formData, ['email'], { message: SIGN_IN_FAILED });
  }
  const result = await signIn({ email, password, ip: await clientIp() });
  if (!result.ok) return failed(formData, ['email'], { message: result.error });

  // A browser that was already signed in as someone else must not leave that session behind.
  await signOut(await readSessionToken());
  await clearSessionCookie();
  await writeSessionCookie(result.token, result.expiresAt);
  redirect('/');
}
