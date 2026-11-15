'use client';

import { useActionState } from 'react';
import { ErrorSummary, Field, SubmitButton } from '@/ui';
import { initialFormState, summaryItems } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import { signInAction } from './actions';

export function SignInForm() {
  const [state, action] = useActionState(signInAction, initialFormState);
  return (
    <form action={action} noValidate className={forms.form}>
      <ErrorSummary errors={summaryItems(state)} focusToken={state} />
      <Field label="Email address" name="email" type="email" autoComplete="username" defaultValue={state.values?.email ?? ''} required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <div className={forms.actions}>
        <SubmitButton variant="primary" size="large" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </div>
    </form>
  );
}
