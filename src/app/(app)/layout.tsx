import { getActor } from '@/auth/current';
import { AppShell } from '@/ui';
import { navFor } from '@/app/_lib/guard';
import { signOutAction } from '@/app/_lib/session-actions';

/**
 * Only fills in the frame (name, practice, navigation). It is NOT an access check: layouts do not
 * re-run on navigation and do not stop the page rendering. Every page and action checks for itself.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  // Signed out: the page will redirect to /sign-in, so there is nothing to frame.
  if (!actor) return <>{children}</>;
  return (
    <AppShell userName={actor.name} practiceName={actor.membership?.practiceName ?? null} nav={navFor(actor)} signOutAction={signOutAction}>
      {children}
    </AppShell>
  );
}
