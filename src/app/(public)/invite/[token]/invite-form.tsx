'use client';

import { useActionState } from 'react';
import { ErrorSummary, Field, SubmitButton } from '@/ui';
import { initialFormState, summaryItems } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import { PrivacyCheckbox } from '@/app/_lib/privacy-checkbox';
import { acceptInvitationAction } from './actions';

const ORDER = ['password', 'confirmPassword', 'privacy'];

type Props = {
  token: string;
  kind: 'invite' | 'reset';
  name: string;
  email: string;
  practiceName: string | null;
  needsPrivacyAck: boolean;
};

export function InviteForm({ token, kind, name, email, practiceName, needsPrivacyAck }: Props) {
  const [state, action] = useActionState(acceptInvitationAction, initialFormState);
  const e = state.errors ?? {};
  return (
    <form action={action} noValidate className={forms.form}>
      <ErrorSummary errors={summaryItems(state, ORDER)} focusToken={state} />
      <input type="hidden" name="token" value={token} />
      {kind === 'invite' && (
        <>
          <Field label="Name" name="displayName" value={name} readOnly hint="Your manager entered this. Ask them if it is wrong." />
          <Field label="Email address" name="displayEmail" value={email} readOnly autoComplete="username" />
        </>
      )}
      <Field
        label={kind === 'invite' ? 'Choose a password' : 'New password'}
        name="password"
        type="password"
        hint="At least 12 characters. Do not use your email address or an obvious word."
        autoComplete="new-password"
        error={e.password}
        required
      />
      <Field
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={e.confirmPassword}
        required
      />
      {needsPrivacyAck && (
        <>
          {kind === 'invite' && practiceName && (
            <p className={forms.note}>
              Managers at {practiceName} can see your practice calls, transcripts and scores. Read the privacy notice to see who else can
              see them, and why.
            </p>
          )}
          <PrivacyCheckbox error={e.privacy} />
        </>
      )}
      <div className={forms.actions}>
        <SubmitButton size="large" pendingLabel="Saving…">
          {kind === 'invite' ? 'Create my account' : 'Save new password'}
        </SubmitButton>
      </div>
    </form>
  );
}
