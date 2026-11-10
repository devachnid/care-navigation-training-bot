import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { debriefs, scenarios, sessions, transcriptTurns } from '@/db/schema';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A session and its scenario, only if it belongs to this trainee. */
export async function getOwnedSession(sessionId: string, traineeName: string) {
  if (!UUID.test(sessionId)) return null;
  const [row] = await getDb()
    .select({ session: sessions, scenario: scenarios })
    .from(sessions)
    .innerJoin(scenarios, eq(sessions.scenarioId, scenarios.id))
    .where(and(eq(sessions.id, sessionId), eq(sessions.traineeName, traineeName)));
  return row ?? null;
}

export async function getTurns(sessionId: string) {
  return getDb()
    .select({ speaker: transcriptTurns.speaker, text: transcriptTurns.text, sequence: transcriptTurns.sequence })
    .from(transcriptTurns)
    .where(eq(transcriptTurns.sessionId, sessionId))
    .orderBy(asc(transcriptTurns.sequence));
}

export async function getDebrief(sessionId: string) {
  const [row] = await getDb().select().from(debriefs).where(eq(debriefs.sessionId, sessionId));
  return row ?? null;
}
