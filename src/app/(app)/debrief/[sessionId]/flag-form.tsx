'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Alert, ErrorSummary, Field, SubmitButton } from '@/ui';
import { initialFormState, summaryItems } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import { flagDebriefAction } from './actions';
import styles from './debrief.module.css';

type Props = {
  sessionId: string;
  /** The viewer made this call. A manager reading someone else's debrief is not "your manager"'s audience. */
  isOwn: boolean;
  /** A report this person has already made on this debrief. */
  existing: { reason: string; resolved: boolean } | null;
};

/**
 * The report form, or what became of it. It stays on the page after a report is sent (the form
 * goes away, the page now holds the report), so the confirmation can take focus.
 */
export function FlagPanel({ sessionId, isOwn, existing }: Props) {
  const [state, action] = useActionState(flagDebriefAction, initialFormState);
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.success) confirmation.current?.focus();
  }, [state]);

  if (existing) {
    return (
      <div ref={confirmation} tabIndex={-1}>
        <Alert tone="info" title="You reported a problem with this debrief">
          <p className={styles.reported}>
            “{existing.reason}” {existing.resolved ? 'A manager has dealt with your report.' : 'A manager will look at it.'}
          </p>
        </Alert>
      </div>
    );
  }

  return (
    <form action={action} noValidate className={forms.form}>
      <ErrorSummary errors={summaryItems(state)} focusToken={state} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <Field
        as="textarea"
        label="What is wrong with this debrief?"
        name="reason"
        hint={`Up to 500 characters. ${isOwn ? 'Your manager will see this.' : 'Managers at your practice will see this.'}`}
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
