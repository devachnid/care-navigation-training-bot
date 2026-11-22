'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from './Button';
import type { ButtonVariant } from './Button';
import styles from './ConfirmButton.module.css';

export type ConfirmButtonProps = {
  /** First button, for example "Deactivate". */
  label: string;
  /** Second button. Defaults to "Confirm " plus the lower-cased label. */
  confirmLabel?: string;
  /** Shown on the confirm step while the form is being submitted. Defaults to "Working…". */
  pendingLabel?: string;
  cancelLabel?: string;
  /** What will happen, shown beside the confirm step: "Aisha will not be able to sign in." */
  question?: ReactNode;
  /** Sent with the form when confirmed, like any submit button. */
  name?: string;
  value?: string;
  /** Style of the confirm button. Defaults to "danger". The first step is always a quiet secondary button. */
  variant?: ButtonVariant;
};

/**
 * A destructive action that needs a second, deliberate click. Put it inside a `<form action={...}>`:
 * the first click only reveals "Confirm …" and "Cancel"; the form is submitted by the confirm button.
 * Escape cancels. Not a dialog, so there is no focus trap.
 */
export function ConfirmButton({
  label,
  confirmLabel = `Confirm ${label.charAt(0).toLowerCase()}${label.slice(1)}`,
  pendingLabel = 'Working…',
  cancelLabel = 'Cancel',
  question,
  name,
  value,
  variant = 'danger',
}: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false);
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  const first = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const questionId = useId();

  // Back to the first step once the form action has finished.
  useEffect(() => {
    if (wasPending.current && !pending) setAsking(false);
    wasPending.current = pending;
  }, [pending]);

  // Move focus with the change of step, so keyboard and screen reader users are not left on a button that vanished.
  useEffect(() => {
    if (asking) confirm.current?.focus();
    else if (restoreFocus.current) {
      first.current?.focus();
      restoreFocus.current = false;
    }
  }, [asking]);

  function cancel() {
    restoreFocus.current = true;
    setAsking(false);
  }

  if (!asking) {
    return (
      <Button ref={first} variant="secondary" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }

  return (
    <span
      className={styles.group}
      role="group"
      aria-labelledby={question ? questionId : undefined}
      onKeyDown={event => {
        if (event.key === 'Escape') cancel();
      }}
    >
      {question && (
        <span id={questionId} className={styles.question}>
          {question}
        </span>
      )}
      <Button ref={confirm} type="submit" variant={variant} name={name} value={value} pending={pending}>
        {pending ? pendingLabel : confirmLabel}
      </Button>
      <Button variant="secondary" onClick={cancel} disabled={pending}>
        {cancelLabel}
      </Button>
    </span>
  );
}
