'use client';

import { useActionState } from 'react';
import { ErrorSummary, Field, SubmitButton } from '@/ui';
import { initialFormState, summaryItems } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import { flagDebriefAction } from './actions';

export function FlagForm({ sessionId }: { sessionId: string }) {
  const [state, action] = useActionState(flagDebriefAction, initialFormState);
  return (
    <form action={action} noValidate className={forms.form}>
      <ErrorSummary errors={summaryItems(state)} focusToken={state} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <Field
        as="textarea"
        label="What is wrong with this debrief?"
        name="reason"
        hint="Up to 500 characters. Your manager will see this."
        maxLength={500}
        rows={4}
        defaultValue={state.values?.reason ?? ''}
        error={state.errors?.reason}
        required
      />
      <div className={forms.actions}>
        <SubmitButton variant="secondary" pendingLabel="Sending…">
          Send report
        </SubmitButton>
      </div>
    </form>
  );
}
