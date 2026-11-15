'use server';

import { redirect } from 'next/navigation';
import { writeSessionCookie } from '@/auth/next-cookies';
import { isSetupOpen, runSetup } from '@/auth/setup';
import { failed, text, type FormState } from '@/app/_lib/form';

const KEEP = ['setupCode', 'name', 'email', 'practiceName'] as const;

/** Public, but only while `isSetupOpen()` and with the right setup code (checked by `runSetup`). */
export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await isSetupOpen())) redirect('/sign-in');

  const errors: Record<string, string> = {};
  if (!text(formData, 'setupCode').trim()) errors.setupCode = 'Enter the setup code.';
  if (!text(formData, 'name').trim()) errors.name = 'Enter your name.';
  if (!text(formData, 'email').trim()) errors.email = 'Enter your email address.';
  const password = text(formData, 'password');
  if (!password) errors.password = 'Choose a password.';
  else if (password !== text(formData, 'confirmPassword')) errors.confirmPassword = 'The two passwords are not the same.';
  if (!text(formData, 'practiceName').trim()) errors.practiceName = 'Enter the practice name.';
  if (formData.get('privacy') !== 'on') errors.privacy = 'Read the privacy notice and tick the box to say you have read it.';
  if (Object.keys(errors).length > 0) return failed(formData, KEEP, { errors });

  const result = await runSetup({
    setupCode: text(formData, 'setupCode'),
    name: text(formData, 'name'),
    email: text(formData, 'email'),
    password,
    practiceName: text(formData, 'practiceName'),
    privacyAccepted: true,
  });
  if (!result.ok) return failed(formData, KEEP, { message: result.error });

  await writeSessionCookie(result.token, result.expiresAt);
  redirect('/');
}
