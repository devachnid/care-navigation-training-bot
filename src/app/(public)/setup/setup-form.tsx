'use client';

import { useActionState } from 'react';
import { Checkbox, ErrorSummary, Field, SubmitButton } from '@/ui';
import { initialFormState, summaryItems } from '@/app/_lib/form';
import { PrivacyCheckbox } from '@/app/_lib/privacy-checkbox';
import forms from '@/app/_lib/forms.module.css';
import { setupAction } from './actions';

const ORDER = ['setupCode', 'name', 'email', 'password', 'confirmPassword', 'practiceName', 'privacy'];

export function SetupForm() {
  const [state, action] = useActionState(setupAction, initialFormState);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form action={action} noValidate className={forms.form}>
      <ErrorSummary errors={summaryItems(state, ORDER)} focusToken={state} />
      <Field
        label="Setup code"
        name="setupCode"
        hint="Whoever deployed this app has it."
        autoComplete="off"
        defaultValue={v.setupCode ?? ''}
        error={e.setupCode}
        required
      />
      <Field label="Your name" name="name" autoComplete="name" defaultValue={v.name ?? ''} error={e.name} required />
      <Field
        label="Your email address"
        name="email"
        type="email"
        autoComplete="username"
        defaultValue={v.email ?? ''}
        error={e.email}
        required
      />
      <Field
        label="Password"
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
      <Field label="Practice name" name="practiceName" defaultValue={v.practiceName ?? ''} error={e.practiceName} required />
      <Checkbox
        name="canApprove"
        label="I am a clinician and will approve scenarios for this practice"
        hint="Scenarios are drafts until a clinician has checked them against the practice's protocols. You can also give this to someone else later, on the Team page."
        defaultChecked={v.canApprove === 'on'}
      />
      <PrivacyCheckbox error={e.privacy} />
      <div className={forms.actions}>
        <SubmitButton size="large" pendingLabel="Setting up…">
          Set up
        </SubmitButton>
      </div>
    </form>
  );
}
