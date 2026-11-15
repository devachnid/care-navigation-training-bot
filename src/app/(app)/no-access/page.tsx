import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireActor } from '@/auth/current';
import { Button, EmptyState, PageHeader } from '@/ui';
import { signOutAction } from '@/app/_lib/session-actions';

export const metadata: Metadata = { title: 'No access to a practice' };

/** Where `requireMember()` sends someone who is signed in but is not in a practice. */
export default async function NoAccessPage() {
  const actor = await requireActor();
  if (actor.membership) redirect('/');
  if (actor.isPlatformAdmin) redirect('/admin');
  return (
    <>
      <PageHeader title="You cannot use a practice at the moment" />
      <EmptyState
        title="Nothing has been lost"
        action={
          <form action={signOutAction}>
            <Button type="submit" size="large">
              Sign out
            </Button>
          </form>
        }
      >
        Your account is not active at any practice. This happens if your practice manager has turned off your access, or your practice has
        been paused. Your calls and scores are still saved. Ask your practice manager to turn your access back on. If you belong to
        another practice, you can switch to it from My account.
      </EmptyState>
    </>
  );
}
