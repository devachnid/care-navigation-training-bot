'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Alert, Button, Card, Checkbox, ErrorSummary, Section, SubmitButton } from '@/ui';
import { initialFormState, summaryItems } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import stack from '@/app/_lib/stack.module.css';
import { approveScenarioAction, tryCallAction } from '../actions';
import styles from '../scenarios.module.css';

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

/**
 * The clinician's approval: approves exactly the version (`revision`) on screen. It stays on the page
 * after the scenario is approved, so the confirmation can be shown and focus moved to it (the form
 * itself goes away once the scenario is approved). The page gives it `key={revision}`, so editing the
 * scenario afterwards starts it afresh.
 */
export function ApprovalPanel({
  scenarioId,
  revision,
  approved,
  active,
  savedAt,
}: {
  scenarioId: string;
  revision: number;
  approved: boolean;
  active: boolean;
  /** "12 Nov 2026, 14:05": when this version was last saved. */
  savedAt: string;
}) {
  const [state, action] = useActionState(approveScenarioAction, initialFormState);
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.success) confirmation.current?.focus();
  }, [state]);

  if (state.success) {
    return (
      <Section title="Approval">
        <div ref={confirmation} tabIndex={-1}>
          <Alert tone="success" title="Approved">
            {active
              ? 'Staff can now practise this scenario. If you change it later, it goes back to being a draft until a clinician approves it again.'
              : 'It is hidden from staff at the moment. Choose “Show to staff” under Status when you want them to practise it.'}
          </Alert>
        </div>
      </Section>
    );
  }
  if (approved) return null;

  return (
    <Section
      title="Approval"
      description="A clinician checks the scenario, and especially its answer key, against your practice’s own protocols."
    >
      <Card>
        <p className={styles.note}>Version last saved {savedAt}. Read the answer key below before you approve.</p>
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
              Approve this scenario
            </SubmitButton>
          </div>
        </form>
      </Card>
    </Section>
  );
}
