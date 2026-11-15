import { getActor } from '@/auth/current';
import { isSameOrigin } from '@/auth/origin';
import { runDebrief } from '@/debrief/run';
import { can } from '@/policy/can';
import { endCall } from '@/sessions/dal';

// The debrief model call can take a while.
export const maxDuration = 120;

/** Saves the transcript when a call ends and produces the debrief. Audio is never sent or stored. */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const actor = await getActor();
  if (!actor) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (!can(actor, 'calls.take')) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { sessionId } = await params;

  const ended = await endCall(actor, sessionId, await request.json().catch(() => null));
  if (!ended.ok) {
    const status = ended.code === 'not_found' ? 404 : 400;
    return Response.json({ error: ended.error }, { status });
  }
  if (!ended.needsDebrief) return Response.json({ status: ended.status });
  try {
    await runDebrief(actor, sessionId);
    return Response.json({ status: 'complete' });
  } catch {
    return Response.json({ status: 'failed' });
  }
}
