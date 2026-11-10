import { notFound, redirect } from 'next/navigation';
import { requireTrainee } from '@/access/require';
import { buildSessionConfig } from '@/patient/session-config';
import { getOwnedSession } from '@/sessions/queries';
import { CallScreen } from './call-screen';

export default async function CallPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const name = await requireTrainee();
  const { sessionId } = await params;
  const owned = await getOwnedSession(sessionId, name);
  if (!owned) notFound();
  // A finished call cannot be re-run; show what happened instead.
  if (owned.session.status !== 'created' && owned.session.status !== 'in_call') redirect(`/debrief/${sessionId}`);

  return (
    <CallScreen
      sessionId={sessionId}
      title={owned.scenario.title}
      modelId={process.env.REALTIME_MODEL || 'openai/gpt-realtime-2.1'}
      sessionConfig={buildSessionConfig(owned.scenario)}
    />
  );
}
