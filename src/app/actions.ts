'use server';

import { redirect } from 'next/navigation';
import { requireActor } from '@/auth/current';
import { clearSessionCookie, readSessionToken } from '@/auth/next-cookies';
import { signOut as endSession } from '@/auth/sign-in';
import { runDebrief } from '@/debrief/run';
import { can } from '@/policy/can';
import { claimDebriefRetry, startCall } from '@/sessions/dal';

// Interim actions kept so the PoC pages build; the next engineer replaces them.

export async function signOut() {
  await endSession(await readSessionToken());
  await clearSessionCookie();
  redirect('/sign-in');
}

export async function startSession(formData: FormData) {
  const actor = await requireActor();
  if (!can(actor, 'calls.take')) redirect('/');
  const started = await startCall(actor, String(formData.get('scenarioId') ?? ''));
  if (!started.ok) redirect('/');
  redirect(`/call/${started.sessionId}`);
}

export async function retryDebrief(formData: FormData) {
  const actor = await requireActor();
  const sessionId = String(formData.get('sessionId') ?? '');
  if (can(actor, 'calls.take') && (await claimDebriefRetry(actor, sessionId))) {
    await runDebrief(actor, sessionId).catch(() => {});
  }
  redirect(`/debrief/${sessionId}`);
}
