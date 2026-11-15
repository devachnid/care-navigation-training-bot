import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cx } from './cx';
import { FieldError, Hint, describedBy } from './FormMessage';
import styles from './Field.module.css';

type FieldBase = {
  /** The visible label. Always required: placeholders are not labels. */
  label: ReactNode;
  /** Short help shown under the label. */
  hint?: ReactNode;
  /** Error message. Sets aria-invalid and links the message to the control. */
  error?: ReactNode;
  /** Used for the form value. Also the element id unless `id` is given. */
  name: string;
  /** Element id. Defaults to `name`. Point ErrorSummary links at `#id`. */
  id?: string;
};

export type InputFieldProps = FieldBase & { as?: 'input' } & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'name'>;
export type SelectFieldProps = FieldBase & { as: 'select'; children: ReactNode } & Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    'id' | 'name' | 'children'
  >;
export type TextareaFieldProps = FieldBase & { as: 'textarea' } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'name'>;
export type FieldProps = InputFieldProps | SelectFieldProps | TextareaFieldProps;

/**
 * A labelled form control. `as` picks the control ("input" by default); everything else
 * passes through to it, so `type`, `defaultValue`, `autoComplete`, `<option>` children etc. work.
 */
export function Field(props: FieldProps) {
  const { label, hint, error, name, id: idProp, ...others } = props;
  const id = idProp ?? name;
  const readOnly = 'readOnly' in others && others.readOnly === true;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = {
    id,
    name,
    'aria-describedby': describedBy(hintId, errorId),
    'aria-invalid': error ? true : undefined,
  };

  let element: ReactNode;
  if (others.as === 'select') {
    const { as: _as, className, ...rest } = others;
    void _as;
    element = <select {...rest} {...control} className={cx(styles.control, styles.select, className)} />;
  } else if (others.as === 'textarea') {
    const { as: _as, className, rows = 5, ...rest } = others;
    void _as;
    element = <textarea rows={rows} {...rest} {...control} className={cx(styles.control, className)} />;
  } else {
    const { as: _as, className, ...rest } = others;
    void _as;
    element = <input {...rest} {...control} className={cx(styles.control, className)} />;
  }

  return (
    <div className={cx(styles.field, error ? styles.invalid : false)}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {readOnly && <span className={styles.readOnlyNote}> (cannot be changed)</span>}
      </label>
      {hint && <Hint id={hintId}>{hint}</Hint>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
      {element}
    </div>
  );
}
