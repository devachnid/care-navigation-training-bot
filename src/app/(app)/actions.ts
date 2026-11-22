'use server';

import { redirect } from 'next/navigation';
import { startCall } from '@/sessions/dal';
import { failed, text, type FormState } from '@/app/_lib/form';
import { requireAbility } from '@/app/_lib/guard';

/**
 * The "Start the call" buttons on the home page. A refusal comes back as `message`; when it is the
 * daily limit, `errors.limit` is set too so the page can say so in its own words.
 */
export async function startCallAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility('calls.take');
  const started = await startCall(actor, text(formData, 'scenarioId'));
  if (!started.ok) {
    return failed(formData, [], { message: started.error, errors: started.code === 'limit' ? { limit: started.error } : undefined });
  }
  redirect(`/call/${started.sessionId}`);
}
