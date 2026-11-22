import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getActor } from '@/auth/current';
import { PageHeader } from '@/ui';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage() {
  if (await getActor()) redirect('/');
  return (
    <>
      <PageHeader title="Sign in" lead="Use the email address and password you set up with your practice." />
      <SignInForm />
      <p>Forgotten your password? Ask your practice manager for a reset link.</p>
    </>
  );
}
