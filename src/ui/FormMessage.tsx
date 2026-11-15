import type { ReactNode } from 'react';
import styles from './FormMessage.module.css';

/** Help text under a label or legend. Internal: used by Field, Fieldset, Checkbox. */
export function Hint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.hint}>
      {children}
    </p>
  );
}

/** An error under a field. The word "Error" is in the text so it never relies on colour alone. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.error}>
      <strong>Error:</strong> {children}
    </p>
  );
}

/** Build an aria-describedby value from the ids that exist. */
export function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  const list = ids.filter(Boolean);
  return list.length ? list.join(' ') : undefined;
}
