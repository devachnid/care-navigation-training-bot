'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runDebrief } from '@/debrief/run';
import { flagDebrief } from '@/debrief/flags-dal';
import { claimDebriefRetry } from '@/sessions/dal';
import { failed, text, type FormState } from '@/app/_lib/form';
import { requireAbility } from '@/app/_lib/guard';

/** "Try the debrief again": the caller's own failed call only (checked by `claimDebriefRetry`). */
export async function retryDebriefAction(formData: FormData): Promise<void> {
  const actor = await requireAbility('calls.take');
  const sessionId = text(formData, 'sessionId');
  if (await claimDebriefRetry(actor, sessionId)) {
    await runDebrief(actor, sessionId).catch(() => {});
  }
  redirect(`/debrief/${encodeURIComponent(sessionId)}`);
}

/** "Report a problem with this debrief": the caller, or a manager of the practice. */
export async function flagDebriefAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility('sessions.viewOwn');
  const sessionId = text(formData, 'sessionId');
  const reason = text(formData, 'reason');
  if (!reason.trim()) return failed(formData, ['reason'], { errors: { reason: 'Say what is wrong with the debrief.' } });

  const result = await flagDebrief(actor, sessionId, reason);
  if (!result.ok) {
    return result.code === 'invalid'
      ? failed(formData, ['reason'], { errors: { reason: result.error } })
      : failed(formData, ['reason'], { message: result.error });
  }
  revalidatePath(`/debrief/${sessionId}`);
  return { success: true, message: 'Thank you. Your manager can now see your report.' };
}
