'use server';

import { redirect } from 'next/navigation';
import { requireActor } from '@/auth/current';
import { readSessionToken } from '@/auth/next-cookies';
import { changePassword } from '@/auth/sign-in';
import { switchPractice } from '@/practices/dal';
import { text, type FormState } from '@/app/_lib/form';
import { clientIp } from '@/app/_lib/request';

/** Any signed-in person (a platform admin with no practice included) may change their own password. */
export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const current = text(formData, 'currentPassword');
  const next = text(formData, 'newPassword');

  const errors: Record<string, string> = {};
  if (!current) errors.currentPassword = 'Enter your current password.';
  if (!next) errors.newPassword = 'Choose a new password.';
  else if (next !== text(formData, 'confirmPassword')) errors.confirmPassword = 'The two new passwords are not the same.';
  if (Object.keys(errors).length > 0) return { errors };

  const result = await changePassword(actor, { currentPassword: current, newPassword: next, sessionToken: await readSessionToken(), ip: await clientIp() });
  if (!result.ok) return { message: result.error };
  return { success: true, message: 'Your password has been changed. You have been signed out everywhere else.' };
}

/** The "Switch" buttons. The practice id is checked against the person's own memberships. */
export async function switchPracticeAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const token = await readSessionToken();
  if (!token) redirect('/sign-in');
  await switchPractice(actor, token, text(formData, 'practiceId'));
  redirect('/');
}
