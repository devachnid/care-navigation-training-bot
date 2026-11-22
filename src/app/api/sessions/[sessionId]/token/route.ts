import { gateway } from 'ai';
import { getActor } from '@/auth/current';
import { isSameOrigin } from '@/auth/origin';
import { can } from '@/policy/can';
import { claimForToken } from '@/sessions/dal';

/**
 * Mints the short-lived token the browser uses to open the voice connection.
 * The gateway API key stays on the server; only this single-use token leaves it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const actor = await getActor();
  if (!actor) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (!can(actor, 'calls.take')) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { sessionId } = await params;

  // Only the caller's own call that has not finished can be (re)connected.
  const claimed = await claimForToken(actor, sessionId);
  if (!claimed.ok) {
    return Response.json({ error: claimed.error }, { status: claimed.code === 'not_found' ? 404 : 409 });
  }

  try {
    const token = await gateway.experimental_realtime.getToken({
      model: process.env.REALTIME_MODEL || 'openai/gpt-realtime-2.1',
      expiresAfterSeconds: 60,
    });
    return Response.json(token, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('Realtime token mint failed', err);
    return Response.json({ error: 'Could not start the call' }, { status: 502 });
  }
}
