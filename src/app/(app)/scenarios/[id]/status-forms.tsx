'use client';

import { useActionState } from 'react';
import { Alert, Button, Checkbox, ErrorSummary, SubmitButton } from '@/ui';
import { initialFormState, summaryItems } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import stack from '@/app/_lib/stack.module.css';
import { approveScenarioAction, tryCallAction } from '../actions';

/** "Try this call": starts a call for the person pressing it. A refusal (for example the daily limit) is shown beside it. */
export function TryCallForm({ scenarioId, disabled }: { scenarioId: string; disabled: boolean }) {
  const [state, action] = useActionState(tryCallAction, initialFormState);
  return (
    <form action={action}>
      <input type="hidden" name="scenarioId" value={scenarioId} />
      {state.message && (
        <div className={stack.alerts}>
          <Alert tone="error" title="The call could not start">
            {state.message}
          </Alert>
        </div>
      )}
      {disabled ? (
        <Button disabled>Try this call</Button>
      ) : (
        <SubmitButton pendingLabel="Starting…">Try this call</SubmitButton>
      )}
    </form>
  );
}

/** The clinician's approval: approves exactly the version (`revision`) on screen. */
export function ApproveForm({ scenarioId, revision }: { scenarioId: string; revision: number }) {
  const [state, action] = useActionState(approveScenarioAction, initialFormState);
  return (
    <form action={action} noValidate className={forms.form}>
      <ErrorSummary errors={summaryItems(state)} focusToken={state} />
      <input type="hidden" name="scenarioId" value={scenarioId} />
      <input type="hidden" name="revision" value={revision} />
      <Checkbox
        name="confirm"
        label="I have checked this scenario and its answer key against our practice’s protocols"
        error={state.errors?.confirm}
        hint="You are approving the version shown on this page. If anyone changes it before you press Approve, it will not be approved."
      />
      <div className={forms.actions}>
        <SubmitButton variant="go" pendingLabel="Approving…">
          Approve
        </SubmitButton>
      </div>
    </form>
  );
}
