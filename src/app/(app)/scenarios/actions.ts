'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { fieldErrors, formValues, parseScenarioForm } from '@/scenarios/form';
import { addFromLibrary, approveScenario, createScenario, setScenarioActive, updateScenario } from '@/scenarios/practice-dal';
import { scenarioContentSchema } from '@/scenarios/types';
import { startCall } from '@/sessions/dal';
import { text, type FormState } from '@/app/_lib/form';
import { requireAbility } from '@/app/_lib/guard';

const CHANGED_SINCE_OPENED =
  'Someone else has changed this scenario since you opened this page, so nothing was saved. What you typed is still below: copy anything you want to keep, then reload the page to see their changes.';

/**
 * Save the scenario form: a new scenario (no `scenarioId`) or a change to an existing one, which
 * must carry the `revision` the form was loaded with. The content is checked here against the
 * backend's schema so each problem lands beside its field, and again by the backend.
 */
export async function saveScenarioAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility('scenarios.manage');
  const values = formValues(formData);
  const scenarioId = text(formData, 'scenarioId');

  const parsed = parseScenarioForm(formData);
  const checked = scenarioContentSchema.safeParse(parsed.input);
  if (!checked.success) {
    const { form, ...errors } = fieldErrors(checked.error, parsed);
    return { errors, message: form, values };
  }

  if (!scenarioId) {
    const created = await createScenario(actor, checked.data);
    if (!created.ok) return { message: created.error, values };
    revalidatePath('/scenarios');
    redirect(`/scenarios/${created.id}`);
  }

  const revision = Number(text(formData, 'revision'));
  if (!Number.isInteger(revision)) return { message: 'Reload the page and try again.', values };
  const saved = await updateScenario(actor, scenarioId, checked.data, revision);
  if (!saved.ok) {
    if (saved.code === 'not_found') notFound();
    return { message: saved.code === 'conflict' ? CHANGED_SINCE_OPENED : saved.error, values };
  }
  revalidatePath(`/scenarios/${scenarioId}`);
  revalidatePath('/scenarios');
  return { success: true, message: 'Your changes are saved.' };
}

/** "Try this call": starts a call for the person pressing it and goes to the call screen. */
export async function tryCallAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility('scenarios.manage');
  const started = await startCall(actor, text(formData, 'scenarioId'));
  if (!started.ok) return { message: started.error };
  redirect(`/call/${started.sessionId}`);
}

/** "Hide from staff" and "Show to staff". */
export async function setVisibilityAction(formData: FormData): Promise<void> {
  const actor = await requireAbility('scenarios.manage');
  const id = text(formData, 'scenarioId');
  const result = await setScenarioActive(actor, id, text(formData, 'active') === 'true');
  if (!result.ok) notFound();
  revalidatePath(`/scenarios/${id}`);
  revalidatePath('/scenarios');
}

/**
 * Approve exactly the version the person was looking at. If it has changed since the page loaded,
 * nothing is approved.
 */
export async function approveScenarioAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility('scenarios.approve');
  const id = text(formData, 'scenarioId');
  if (text(formData, 'confirm') !== 'on') {
    return { errors: { confirm: 'Tick the box to say you have checked this scenario against your practice’s protocols.' } };
  }
  const revision = Number(text(formData, 'revision'));
  if (!Number.isInteger(revision)) return { message: 'Reload the page and try again.' };
  const result = await approveScenario(actor, id, revision);
  if (!result.ok) {
    if (result.code === 'not_found') notFound();
    return {
      message:
        result.code === 'conflict'
          ? 'This scenario has been changed since you opened this page, so it was not approved. Reload the page, check the new version, then approve it.'
          : result.error,
    };
  }
  revalidatePath(`/scenarios/${id}`);
  revalidatePath('/scenarios');
  return { success: true, message: 'Approved.' };
}

/** The "Add" buttons in the library list: copies the scenario into the practice as a draft, then opens it. */
export async function addFromLibraryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility('scenarios.manage');
  const added = await addFromLibrary(actor, text(formData, 'libraryScenarioId'));
  revalidatePath('/scenarios');
  if (!added.ok) return { message: added.error };
  redirect(`/scenarios/${added.id}`);
}
