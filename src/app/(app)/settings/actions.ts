'use server';

import { revalidatePath } from 'next/cache';
import { cleanPracticeName, updatePracticeSettings } from '@/practices/dal';
import { failed, text, type FormState } from '@/app/_lib/form';
import { requireAbility } from '@/app/_lib/guard';

const KEEP = ['name', 'retention'] as const;

/** "Keep until deleted", or a number of days from the list on the page. */
const RETENTION = /^\d{1,4}$/;

export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility('practice.settings');
  const name = text(formData, 'name');
  const allowDraftScenarios = formData.get('allowDraftScenarios') === 'on';
  const retention = text(formData, 'retention');

  const errors: Record<string, string> = {};
  if (!cleanPracticeName(name)) errors.name = 'Enter the practice name (2 to 120 characters).';
  if (retention !== '' && !RETENTION.test(retention)) errors.retention = 'Choose how long to keep transcripts.';
  const keep = (extra: { errors?: Record<string, string>; message?: string }) => ({
    ...failed(formData, KEEP, extra),
    values: { ...failed(formData, KEEP, {}).values, allowDraftScenarios: allowDraftScenarios ? 'on' : '' },
  });
  if (Object.keys(errors).length > 0) return keep({ errors });

  const result = await updatePracticeSettings(actor, {
    name,
    allowDraftScenarios,
    transcriptRetentionDays: retention === '' ? null : Number(retention),
  });
  if (!result.ok) return keep(result.code === 'invalid' ? { errors: { retention: result.error } } : { message: result.error });

  revalidatePath('/settings');
  return { success: true, message: 'Your settings have been saved.' };
}
