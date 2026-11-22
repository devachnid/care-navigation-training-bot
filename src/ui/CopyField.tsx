'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './Button';
import { Hint } from './FormMessage';
import styles from './CopyField.module.css';

export type CopyFieldProps = {
  /** Label for the text box, for example "Invitation link for Aisha Rahman". */
  label: string;
  /** The text to show and copy, usually a one-time link. */
  value: string;
  hint?: string;
};

/** A read-only box holding a link, with a Copy button that says "Copied". */
export function CopyField({ label, value, hint }: CopyFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 4000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    input.current?.select();
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      // Older browsers, or a page without clipboard permission: fall back to the selection we just made.
      setState(document.execCommand?.('copy') ? 'copied' : 'failed');
    }
  }

  return (
    <div className={styles.wrap}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {hint && <Hint id={`${id}-hint`}>{hint}</Hint>}
      <div className={styles.row}>
        <input
          ref={input}
          id={id}
          type="text"
          readOnly
          value={value}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onFocus={event => event.currentTarget.select()}
          className={styles.input}
        />
        <Button variant="secondary" onClick={copy} aria-describedby={`${id}-status`}>
          {state === 'copied' ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p id={`${id}-status`} role="status" className={state === 'failed' ? styles.failed : styles.status}>
        {state === 'copied' && 'Copied to the clipboard.'}
        {state === 'failed' && 'Could not copy. The link is selected: press Ctrl and C to copy it.'}
      </p>
    </div>
  );
}
