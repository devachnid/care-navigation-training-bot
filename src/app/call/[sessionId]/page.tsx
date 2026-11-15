import { notFound, redirect } from 'next/navigation';
import { requireActor } from '@/auth/current';
import { buildSessionConfig } from '@/patient/session-config';
import { can } from '@/policy/can';
import { getSession } from '@/sessions/dal';
import { CallScreen } from './call-screen';

export default async function CallPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const actor = await requireActor();
  if (!can(actor, 'calls.take')) notFound();
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
      sessionConfig={buildSessionConfig(session.scenario)}
    />
  );
}
