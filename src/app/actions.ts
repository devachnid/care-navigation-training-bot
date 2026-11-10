'use server';

import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { TRAINEE_COOKIE, safeEqual, signTrainee } from '@/access/cookie';
import { requireTrainee } from '@/access/require';
import { getDb } from '@/db/client';
import { scenarios, sessions } from '@/db/schema';
import { runDebrief } from '@/debrief/run';
import { getOwnedSession } from '@/sessions/queries';

export type EnterState = { error?: string; name?: string };

export async function enter(_prev: EnterState, formData: FormData): Promise<EnterState> {
  const code = String(formData.get('code') ?? '').trim();
  const name = String(formData.get('name') ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  const expected = process.env.ACCESS_CODE ?? '';
  if (!expected) return { error: 'The access code has not been set up. Tell whoever runs this tool.' };
  if (!safeEqual(code, expected)) return { error: 'That access code is not right. Check it and try again.', name };
  if (name.length < 1 || name.length > 60) return { error: 'Enter your name (up to 60 characters).', name };

  const store = await cookies();
  store.set(TRAINEE_COOKIE, signTrainee(name, expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  redirect('/');
}

export async function signOut() {
  (await cookies()).delete(TRAINEE_COOKIE);
  redirect('/');
}

export async function startSession(formData: FormData) {
  const name = await requireTrainee();
  const scenarioId = String(formData.get('scenarioId') ?? '');
  const db = getDb();
  const [scenario] = await db
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.active, true)));
  if (!scenario) redirect('/');
  const [session] = await db.insert(sessions).values({ traineeName: name, scenarioId: scenario.id }).returning({ id: sessions.id });
  redirect(`/call/${session.id}`);
}

export async function retryDebrief(formData: FormData) {
  const name = await requireTrainee();
  const sessionId = String(formData.get('sessionId') ?? '');
  const owned = await getOwnedSession(sessionId, name);
  if (owned?.session.status === 'failed') {
    await getDb().update(sessions).set({ status: 'debriefing' }).where(eq(sessions.id, sessionId));
    await runDebrief(sessionId).catch(() => {});
  }
  redirect(`/debrief/${sessionId}`);
}
