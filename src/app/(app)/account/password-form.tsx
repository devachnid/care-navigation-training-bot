'use client';

import { useActionState } from 'react';
import { Alert, ErrorSummary, Field, SubmitButton } from '@/ui';
import { initialFormState, summaryItems } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import { changePasswordAction } from './actions';

const ORDER = ['currentPassword', 'newPassword', 'confirmPassword'];

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialFormState);
  const e = state.errors ?? {};
  return (
    <form action={action} noValidate className={forms.form}>
      <ErrorSummary errors={summaryItems(state, ORDER)} focusToken={state} />
      {state.success && state.message && <Alert tone="success">{state.message}</Alert>}
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        error={e.currentPassword}
        required
      />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        hint="At least 12 characters. Do not use your email address or an obvious word."
        autoComplete="new-password"
        error={e.newPassword}
        required
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={e.confirmPassword}
        required
      />
      <div className={forms.actions}>
        <SubmitButton pendingLabel="Saving…">Change password</SubmitButton>
      </div>
    </form>
  );
}
