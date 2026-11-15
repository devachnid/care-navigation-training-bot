'use server';

import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { revokeManagerInvitation } from '@/admin/dal';
import { cleanName, isPlausibleEmail, normaliseEmail } from '@/auth/email';
import { createManagerInvitation, createResetLinkAsPlatformAdmin } from '@/auth/invitations';
import { createPractice, setPracticeSuspended } from '@/practices/dal';
import { failed, text, type FormState } from '@/app/_lib/form';
import { requireAbility } from '@/app/_lib/guard';
import type { LinkFormState } from './state';

/** "Add a practice": creates it, then shows its page. */
export async function addPracticeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility('platform.admin');
  const result = await createPractice(actor, { name: text(formData, 'name') });
  if (!result.ok) return failed(formData, ['name'], { errors: { name: result.error } });
  redirect(`/admin/practices/${result.practiceId}`);
}

/** "Suspend" / "Resume", from the practice page. */
export async function setSuspendedAction(formData: FormData): Promise<void> {
  const actor = await requireAbility('platform.admin');
  const practiceId = text(formData, 'practiceId');
  const result = await setPracticeSuspended(actor, practiceId, text(formData, 'suspended') === 'true');
  if (!result.ok) notFound();
  revalidatePath('/admin');
  revalidatePath(`/admin/practices/${practiceId}`);
}

/** "Invite a manager". The link goes back to the browser in the response and is stored nowhere. */
export async function inviteManagerAction(_prev: LinkFormState, formData: FormData): Promise<LinkFormState> {
  const actor = await requireAbility('platform.admin');
  const practiceId = text(formData, 'practiceId');
  const name = cleanName(text(formData, 'name'));
  const email = normaliseEmail(text(formData, 'email'));

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Enter the manager's name (up to 80 characters).";
  if (!email) errors.email = 'Enter their work email address.';
  else if (!isPlausibleEmail(email)) errors.email = 'Enter an email address like name@practice.nhs.uk.';
  if (Object.keys(errors).length > 0 || !name) return failed(formData, ['name', 'email'], { errors });

  const result = await createManagerInvitation(actor, practiceId, { name, email });
  if (!result.ok) {
    if (result.code === 'not_found') notFound();
    return result.code === 'invalid'
      ? failed(formData, ['name', 'email'], { errors: { email: result.error } })
      : failed(formData, ['name', 'email'], { message: result.error });
  }
  revalidatePath(`/admin/practices/${practiceId}`);
  return {
    success: true,
    message: `The invitation for ${name} is ready.`,
    link: { path: `/invite/${result.token}`, name, expiresAt: result.expiresAt.toISOString() },
  };
}

/** "Waiting to join": cancel one invitation. */
export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const actor = await requireAbility('platform.admin');
  const practiceId = text(formData, 'practiceId');
  await revokeManagerInvitation(actor, practiceId, text(formData, 'invitationId'));
  revalidatePath(`/admin/practices/${practiceId}`);
}

/** "Create a password reset link" for one person. */
export async function resetLinkAction(_prev: LinkFormState, formData: FormData): Promise<LinkFormState> {
  const actor = await requireAbility('platform.admin');
  const userId = text(formData, 'userId');
  const result = await createResetLinkAsPlatformAdmin(actor, userId);
  if (!result.ok) return { message: result.error };
  // Only used for the label above the link.
  const name = text(formData, `name-${userId}`).slice(0, 80);
  return {
    success: true,
    message: `The reset link for ${name} is ready.`,
    link: { path: `/invite/${result.token}`, name, expiresAt: result.expiresAt.toISOString() },
  };
}
