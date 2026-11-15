import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireActor } from '@/auth/current';
import { Button, EmptyState, PageHeader } from '@/ui';
import { signOutAction } from '@/app/_lib/session-actions';

export const metadata: Metadata = { title: 'No access' };

/** Where `requireMember()` sends someone who is signed in but is not in a practice. */
export default async function NoAccessPage() {
  const actor = await requireActor();
  if (actor.membership) redirect('/');
  if (actor.isPlatformAdmin) redirect('/admin');
  return (
    <>
      <PageHeader title="You no longer have access to a practice" />
      <EmptyState
        title="Your account is not part of a practice"
        action={
          <form action={signOutAction}>
            <Button type="submit" size="large">
              Sign out
            </Button>
          </form>
        }
      >
        Your manager may have removed you, or your practice may have been paused. Ask your practice manager. If you belong to another
        practice, you can switch to it from My account.
      </EmptyState>
    </>
  );
}
