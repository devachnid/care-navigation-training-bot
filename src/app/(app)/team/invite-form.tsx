'use client';

import { useActionState } from 'react';
import { Alert, Checkbox, ErrorSummary, Field, RadioGroup, SubmitButton } from '@/ui';
import { summaryItems } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import stack from '@/app/_lib/stack.module.css';
import { inviteAction } from './actions';
import { OneTimeLink } from './one-time-link';
import type { LinkState } from './state';

const ORDER = ['name', 'email', 'role', 'canApprove'];
const initial: LinkState = {};

export function InviteForm() {
  const [state, action] = useActionState(inviteAction, initial);
  const e = state.errors ?? {};
  const v = state.values ?? {};
  return (
    <>
      <div className={stack.alerts}>
        {state.link && <OneTimeLink link={state.link} kind="invite" />}
        {state.success && !state.link && state.message && <Alert tone="success">{state.message}</Alert>}
      </div>
      <form action={action} noValidate className={forms.form}>
        <ErrorSummary errors={summaryItems(state, ORDER)} focusToken={state} />
        <Field label="Name" name="name" autoComplete="off" defaultValue={v.name} error={e.name} required />
        <Field
          label="Work email"
          name="email"
          type="email"
          autoComplete="off"
          hint="They will use this to sign in."
          defaultValue={v.email}
          error={e.email}
          required
        />
        <RadioGroup
          legend="What can they do?"
          name="role"
          defaultValue={v.role || 'trainee'}
          error={e.role}
          options={[
            { value: 'trainee', label: 'Trainee', hint: 'Takes practice calls and sees their own scores and history.' },
            {
              value: 'manager',
              label: 'Manager',
              hint: 'Also sees everyone’s calls and scores, invites and manages staff, writes scenarios and changes settings.',
            },
          ]}
        />
        <Checkbox
          name="canApprove"
          label="Can approve scenarios (a clinician who checks them against your protocols)"
          defaultChecked={v.canApprove === 'on'}
        />
        <div className={forms.actions}>
          <SubmitButton pendingLabel="Making the link…">Make an invitation link</SubmitButton>
        </div>
      </form>
    </>
  );
}
