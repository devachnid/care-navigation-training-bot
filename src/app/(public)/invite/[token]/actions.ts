'use server';

import { redirect } from 'next/navigation';
import { acceptInvitation, lookupInvitation } from '@/auth/invitations';
import { clearSessionCookie, readSessionToken, writeSessionCookie } from '@/auth/next-cookies';
import { signOut } from '@/auth/sign-in';
import { failed, text, type FormState } from '@/app/_lib/form';
import { clientIp } from '@/app/_lib/request';

/**
 * Public: the token in the form is the credential. Accepts an invitation or uses a reset link, then
 * signs in. When the invited email already has an account, the password is that account's current
 * one (checked and throttled like sign-in); it is never changed here.
 */
export async function acceptInvitationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = text(formData, 'token');
  const details = await lookupInvitation(token);
  // Used, expired or cancelled since the page was drawn: the page now shows the "ask for a new link" message.
  if (!details) redirect(`/invite/${encodeURIComponent(token)}`);

  const errors: Record<string, string> = {};
  const password = text(formData, 'password');
  if (details.existingAccount) {
    if (!password) errors.password = 'Enter the password you use to sign in.';
  } else if (!password) errors.password = 'Choose a password.';
  else if (password !== text(formData, 'confirmPassword')) errors.confirmPassword = 'The two passwords are not the same.';
  const privacyAccepted = formData.get('privacy') === 'on';
  if (details.needsPrivacyAck && !privacyAccepted) errors.privacy = 'Read the privacy notice and tick the box to say you have read it.';
  if (Object.keys(errors).length > 0) return failed(formData, [], { errors });

  const result = await acceptInvitation({ token, password, privacyAccepted, ip: await clientIp() });
  if (!result.ok) {
    if (result.code === 'not_found') redirect(`/invite/${encodeURIComponent(token)}`);
    // Everything else the form can get wrong is checked above, so this is the password: the rules for a new one,
    // or a wrong current password (including too many tries).
    return result.code === 'invalid' || result.code === 'limit'
      ? failed(formData, [], { errors: { password: result.error } })
      : failed(formData, [], { message: result.error });
  }

  await signOut(await readSessionToken());
  await clearSessionCookie();
  await writeSessionCookie(result.token, result.expiresAt);
  redirect('/');
}
