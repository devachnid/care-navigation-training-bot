import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isSetupOpen } from '@/auth/setup';
import { PageHeader } from '@/ui';
import { SetupForm } from './setup-form';

export const metadata: Metadata = { title: 'Set up' };

// Whether setup is open is read from the database on every request. Without this the page would be built once, at deploy time.
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (!(await isSetupOpen())) notFound();
  return (
    <>
      <PageHeader
        title="Set up the service"
        lead="This creates your account as the administrator, and your practice. You can only do this once."
      />
      <SetupForm />
    </>
  );
}
