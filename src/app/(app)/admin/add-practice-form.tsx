'use client';

import { useActionState } from 'react';
import { ErrorSummary, Field, SubmitButton } from '@/ui';
import { initialFormState, summaryItems } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import { addPracticeAction } from './actions';

export function AddPracticeForm() {
  const [state, action] = useActionState(addPracticeAction, initialFormState);
  return (
    <form action={action} noValidate className={forms.form}>
      <ErrorSummary errors={summaryItems(state)} focusToken={state} />
      <Field
        label="Practice name"
        name="name"
        hint="For example, Ty Gwyn Surgery. You can invite its first manager on the next page."
        maxLength={120}
        autoComplete="off"
        defaultValue={state.values?.name ?? ''}
        error={state.errors?.name}
        required
      />
      <div className={forms.actions}>
        <SubmitButton pendingLabel="Adding…">Add practice</SubmitButton>
      </div>
    </form>
  );
}
