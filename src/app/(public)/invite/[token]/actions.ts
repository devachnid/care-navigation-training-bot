'use server';

import { redirect } from 'next/navigation';
import { acceptInvitation, lookupInvitation } from '@/auth/invitations';
import { clearSessionCookie, readSessionToken, writeSessionCookie } from '@/auth/next-cookies';
import { signOut } from '@/auth/sign-in';
import { failed, text, type FormState } from '@/app/_lib/form';

/** Public: the token in the form is the credential. Accepts an invitation or uses a reset link, then signs in. */
export async function acceptInvitationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = text(formData, 'token');
  const details = await lookupInvitation(token);
  // Used, expired or cancelled since the page was drawn: the page now shows the "ask for a new link" message.
  if (!details) redirect(`/invite/${encodeURIComponent(token)}`);

  const errors: Record<string, string> = {};
  const password = text(formData, 'password');
  if (!password) errors.password = 'Choose a password.';
  else if (password !== text(formData, 'confirmPassword')) errors.confirmPassword = 'The two passwords are not the same.';
  const privacyAccepted = formData.get('privacy') === 'on';
  if (details.needsPrivacyAck && !privacyAccepted) errors.privacy = 'Read the privacy notice and tick the box to say you have read it.';
  if (Object.keys(errors).length > 0) return failed(formData, [], { errors });

  const result = await acceptInvitation({ token, password, privacyAccepted });
  if (!result.ok) {
    if (result.code === 'not_found') redirect(`/invite/${encodeURIComponent(token)}`);
    // Everything else the form can get wrong is checked above, so this is the password rules (or an account that already exists).
    return result.code === 'invalid'
      ? failed(formData, [], { errors: { password: result.error } })
      : failed(formData, [], { message: result.error });
  }

  await signOut(await readSessionToken());
  await clearSessionCookie();
  await writeSessionCookie(result.token, result.expiresAt);
  redirect('/');
}
