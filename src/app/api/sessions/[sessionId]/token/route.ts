import { gateway } from 'ai';
import { and, eq, inArray } from 'drizzle-orm';
import { currentTrainee } from '@/access/require';
import { getDb } from '@/db/client';
import { sessions } from '@/db/schema';
import { getOwnedSession } from '@/sessions/queries';

/**
 * Mints the short-lived token the browser uses to open the voice connection.
 * The gateway API key stays on the server; only this single-use token leaves it.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const name = await currentTrainee();
  if (!name) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const { sessionId } = await params;
  const owned = await getOwnedSession(sessionId, name);
  if (!owned) return Response.json({ error: 'Not found' }, { status: 404 });

  // Only a call that has not finished can be (re)connected.
  const [started] = await getDb()
    .update(sessions)
    .set({ status: 'in_call' })
    .where(and(eq(sessions.id, sessionId), inArray(sessions.status, ['created', 'in_call'])))
    .returning({ id: sessions.id });
  if (!started) return Response.json({ error: 'This call has already ended' }, { status: 409 });

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
