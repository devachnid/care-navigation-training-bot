import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { buildSessionConfig } from '@/patient/session-config';
import { getSession, maxCallSeconds } from '@/sessions/dal';
import { requireAbility } from '@/app/_lib/guard';
import { CallScreen } from './call-screen';

export const metadata: Metadata = { title: 'Practice call' };

export default async function CallPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const actor = await requireAbility('calls.take');
  const { sessionId } = await params;
  const session = await getSession(actor, sessionId);
  // Only the person who started the call can take it.
  if (!session?.isOwn) notFound();
  // A finished call cannot be re-run; show what happened instead.
  if (session.status !== 'created' && session.status !== 'in_call') redirect(`/debrief/${sessionId}`);

  return (
    <CallScreen
      sessionId={sessionId}
      title={session.scenario.title}
      modelId={process.env.REALTIME_MODEL || 'openai/gpt-realtime-2.1'}
      maxSeconds={maxCallSeconds()}
      // Built here from the snapshot. The answer key (outcomes, red flags, hidden facts) never goes to the browser.
      sessionConfig={buildSessionConfig(session.scenario)}
    />
  );
}
