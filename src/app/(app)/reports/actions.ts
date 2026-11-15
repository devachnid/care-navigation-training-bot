'use server';

import { revalidatePath } from 'next/cache';
import { resolveFlag } from '@/debrief/flags-dal';
import { text } from '@/app/_lib/form';
import { requireAbility } from '@/app/_lib/guard';

/**
 * "Mark as dealt with" on a reported debrief problem. If the report was already dealt with (or is
 * not this practice's) there is nothing to do, and the page just shows how things stand now.
 */
export async function resolveFlagAction(formData: FormData): Promise<void> {
  const actor = await requireAbility('reports.view');
  await resolveFlag(actor, text(formData, 'flagId'));
  revalidatePath('/reports');
}
