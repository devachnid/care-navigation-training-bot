'use client';

import { useEffect, useId, useRef } from 'react';
import styles from './ErrorSummary.module.css';

export type ErrorSummaryItem = {
  message: string;
  /** Where the link goes, normally `#` plus the field's id. Without it the message is plain text. */
  href?: string;
};

export type ErrorSummaryProps = {
  errors: ErrorSummaryItem[];
  /** Defaults to "There is a problem". */
  title?: string;
  /** Move focus to the summary when it appears. Defaults to true. */
  autoFocus?: boolean;
  /** Change this value (for example a submission counter) to move focus again when the same errors come back. */
  focusToken?: unknown;
};

/** Lists every problem with a form, each linking to its field. Render it only when there are errors, at the top of the form. */
export function ErrorSummary({ errors, title = 'There is a problem', autoFocus = true, focusToken }: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const signature = errors.map(e => e.message).join('|');

  useEffect(() => {
    if (autoFocus && errors.length > 0) ref.current?.focus();
    // `signature` and `focusToken` are the triggers; `errors` itself changes identity on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, signature, focusToken]);

  if (errors.length === 0) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby={titleId} className={styles.summary}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <ul className={styles.list}>
        {errors.map(error => (
          <li key={`${error.href ?? ''}${error.message}`}>
            {error.href ? <a href={error.href}>{error.message}</a> : error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
