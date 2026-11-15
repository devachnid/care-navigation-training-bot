import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { FieldError, Hint, describedBy } from './FormMessage';
import styles from './Checkbox.module.css';

export type CheckboxProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  name: string;
  /** Defaults to `name`. */
  id?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'name' | 'type'>;

/** One tick box with a large clickable label. For a set of choices use RadioGroup or several Checkboxes in a Fieldset. */
export function Checkbox({ label, hint, error, name, id: idProp, className, ...rest }: CheckboxProps) {
  const id = idProp ?? name;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cx(styles.wrap, error ? styles.invalid : false, className)}>
      <div className={styles.row}>
        <input
          {...rest}
          type="checkbox"
          id={id}
          name={name}
          className={styles.input}
          aria-describedby={describedBy(hintId, errorId)}
          aria-invalid={error ? true : undefined}
        />
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      </div>
      {hint && <Hint id={hintId}>{hint}</Hint>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
