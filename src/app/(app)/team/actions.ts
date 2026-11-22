'use server';

import { revalidatePath } from 'next/cache';
import { createInvitation, createResetLink, revokeInvitation } from '@/auth/invitations';
import { changeMemberRole, deactivateMember, reactivateMember, setMemberApprover } from '@/practices/dal';
import type { MemberActor } from '@/policy/actor';
import type { Result } from '@/policy/result';
import { failed, text, type FormState } from '@/app/_lib/form';
import { requireAbility } from '@/app/_lib/guard';
import type { LinkState } from './state';

const INVITE_FIELDS = ['name', 'email', 'role', 'canApprove'] as const;

/** "Invite someone". The one-time link comes back in the state; nothing is stored or put in a URL. */
export async function inviteAction(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const actor = await requireAbility('team.manage');
  const name = text(formData, 'name').trim();
  const email = text(formData, 'email').trim();
  const role = text(formData, 'role');
  const canApprove = formData.get('canApprove') === 'on';

  const errors: Record<string, string> = {};
  if (!name) errors.name = 'Enter their name.';
  if (!email) errors.email = 'Enter their work email address.';
  if (role !== 'trainee' && role !== 'manager') errors.role = 'Choose what they can do: trainee or manager.';
  if (Object.keys(errors).length > 0) return failed(formData, INVITE_FIELDS, { errors });

  const result = await createInvitation(actor, { name, email, role: role as 'trainee' | 'manager', canApproveScenarios: canApprove });
  if (!result.ok) {
    if (result.code === 'conflict') return failed(formData, INVITE_FIELDS, { errors: { email: result.error } });
    if (result.code === 'invalid' && /email/i.test(result.error)) return failed(formData, INVITE_FIELDS, { errors: { email: result.error } });
    if (result.code === 'invalid' && /name/i.test(result.error)) return failed(formData, INVITE_FIELDS, { errors: { name: result.error } });
    return failed(formData, INVITE_FIELDS, { message: result.error });
  }

  revalidatePath('/team');
  return {
    success: true,
    message: `Invitation ready for ${name}.`,
    link: { token: result.token, expiresAt: result.expiresAt.toISOString(), name },
  };
}

/** Cancels an invitation or reset link made in this practice. */
export async function revokeInvitationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility('team.manage');
  const result = await revokeInvitation(actor, text(formData, 'invitationId'));
  if (!result.ok) {
    revalidatePath('/team');
    return { message: result.error };
  }
  revalidatePath('/team');
  return { success: true, message: 'Cancelled. The link no longer works.' };
}

/** Runs one change to one person, then refreshes the pages that show them. */
async function changePerson(
  formData: FormData,
  change: (actor: MemberActor, userId: string) => Promise<Result>,
  done: string,
): Promise<FormState> {
  const actor = await requireAbility('team.manage');
  const userId = text(formData, 'userId');
  const result = await change(actor, userId);
  if (!result.ok) return { message: result.error };
  revalidatePath('/team');
  revalidatePath(`/team/${userId}`);
  return { success: true, message: done };
}

export async function changeRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAbility('team.manage');
  const role = text(formData, 'role');
  if (role !== 'trainee' && role !== 'manager') return { errors: { role: 'Choose trainee or manager.' } };
  return changePerson(
    formData,
    (actor, userId) => changeMemberRole(actor, userId, role),
    role === 'manager' ? 'Done. They are now a manager.' : 'Done. They are now a trainee.',
  );
}

export async function setApproverAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAbility('team.manage');
  const on = text(formData, 'canApprove') === 'true';
  return changePerson(
    formData,
    (actor, userId) => setMemberApprover(actor, userId, on),
    on ? 'Done. They can now approve scenarios.' : 'Done. They can no longer approve scenarios.',
  );
}

export async function deactivateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAbility('team.manage');
  return changePerson(formData, (actor, userId) => deactivateMember(actor, userId), 'Done. They can no longer sign in to your practice.');
}

export async function reactivateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAbility('team.manage');
  return changePerson(formData, (actor, userId) => reactivateMember(actor, userId), 'Done. They can sign in to your practice again.');
}

/** A 24-hour password reset link. Like the invitation link, it comes back in the state only. */
export async function resetLinkAction(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const actor = await requireAbility('team.manage');
  const result = await createResetLink(actor, text(formData, 'userId'));
  if (!result.ok) return { message: result.error };
  revalidatePath('/team');
  return {
    success: true,
    message: 'The reset link is ready.',
    link: { token: result.token, expiresAt: result.expiresAt.toISOString(), name: text(formData, 'personName') },
  };
}
