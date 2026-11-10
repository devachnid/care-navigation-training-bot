import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { currentTrainee } from '@/access/require';
import { getDb } from '@/db/client';
import { sessions, transcriptTurns } from '@/db/schema';
import { recordTooShort, runDebrief } from '@/debrief/run';
import { getOwnedSession } from '@/sessions/queries';

// The debrief model call can take a while.
export const maxDuration = 120;

/** Calls shorter than this are not assessed: they are recorded as a fail with a score of 0. */
const MIN_CALL_SECONDS = 20;

const bodySchema = z.object({
  durationSeconds: z.number().min(0).max(3600),
  turns: z
    .array(
      z.object({
        speaker: z.enum(['trainee', 'patient']),
        text: z.string().trim().min(1).max(4000),
      }),
    )
    .max(400),
});

/** Saves the transcript when a call ends and produces the debrief. Audio is never sent or stored. */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const name = await currentTrainee();
  if (!name) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const { sessionId } = await params;
  const owned = await getOwnedSession(sessionId, name);
  if (!owned) return Response.json({ error: 'Not found' }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const { turns } = parsed.data;

  // The browser's clock is not trusted beyond the time the session has existed.
  const sinceStart = (Date.now() - owned.session.startedAt.getTime()) / 1000;
  const durationSeconds = Math.round(Math.min(parsed.data.durationSeconds, sinceStart));
  const tooShort = durationSeconds < MIN_CALL_SECONDS || !turns.some(t => t.speaker === 'trainee');
  const status = tooShort ? 'too_short' : 'debriefing';

  const db = getDb();
  // Claim the session so a repeated request cannot save the transcript twice.
  const [claimed] = await db
    .update(sessions)
    .set({ status, endedAt: new Date(), durationSeconds })
    .where(and(eq(sessions.id, sessionId), inArray(sessions.status, ['created', 'in_call'])))
    .returning({ id: sessions.id });
  if (!claimed) return Response.json({ status: owned.session.status });

  if (turns.length > 0) {
    await db.insert(transcriptTurns).values(turns.map((t, i) => ({ sessionId, speaker: t.speaker, text: t.text, sequence: i })));
  }

  if (tooShort) {
    await recordTooShort(sessionId);
    return Response.json({ status });
  }
  try {
    await runDebrief(sessionId);
    return Response.json({ status: 'complete' });
  } catch {
    return Response.json({ status: 'failed' });
  }
}
