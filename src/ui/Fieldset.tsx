import type { FieldsetHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { FieldError, Hint, describedBy } from './FormMessage';
import styles from './Fieldset.module.css';

export type FieldsetProps = {
  /** Names the group for screen readers. Required. */
  legend: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Used to build ids for the hint and error. */
  id?: string;
  children: ReactNode;
} & Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'id' | 'children'>;

/** A group of related controls with a legend. */
export function Fieldset({ legend, hint, error, id, children, className, ...rest }: FieldsetProps) {
  const hintId = hint && id ? `${id}-hint` : undefined;
  const errorId = error && id ? `${id}-error` : undefined;
  return (
    <fieldset
      id={id}
      className={cx(styles.fieldset, error ? styles.invalid : false, className)}
      aria-describedby={describedBy(hintId, errorId)}
      {...rest}
    >
      <legend className={styles.legend}>{legend}</legend>
      {hint && <Hint id={hintId}>{hint}</Hint>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
      <div className={styles.body}>{children}</div>
    </fieldset>
  );
}
