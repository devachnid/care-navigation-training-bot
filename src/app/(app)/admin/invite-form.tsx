'use client';

import { useActionState } from 'react';
import { Alert, ErrorSummary, Field, SubmitButton } from '@/ui';
import { summaryItems } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import { inviteManagerAction } from './actions';
import { LinkBox } from './link-box';
import type { LinkFormState } from './state';

const ORDER = ['name', 'email'];
const initial: LinkFormState = {};

export function InviteForm({ practiceId }: { practiceId: string }) {
  const [state, action] = useActionState(inviteManagerAction, initial);
  const e = state.errors ?? {};
  return (
    <form action={action} noValidate className={forms.form}>
      <ErrorSummary errors={summaryItems(state, ORDER)} focusToken={state} />
      {state.link ? (
        <LinkBox link={state.link} kind="invitation" message={state.message} />
      ) : (
        state.success && state.message && <Alert tone="success">{state.message}</Alert>
      )}
      <input type="hidden" name="practiceId" value={practiceId} />
      <Field label="Manager's name" name="name" autoComplete="off" defaultValue={state.values?.name ?? ''} error={e.name} required />
      <Field label="Work email" name="email" type="email" autoComplete="off" defaultValue={state.values?.email ?? ''} error={e.email} required />
      <div className={forms.actions}>
        <SubmitButton pendingLabel="Making the link…">Make an invitation link</SubmitButton>
      </div>
    </form>
  );
}
