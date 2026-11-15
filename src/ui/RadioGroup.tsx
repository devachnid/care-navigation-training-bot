import type { ReactNode } from 'react';
import { Fieldset } from './Fieldset';
import { Hint } from './FormMessage';
import styles from './RadioGroup.module.css';

export type RadioOption = {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
};

export type RadioGroupProps = {
  legend: ReactNode;
  name: string;
  options: RadioOption[];
  /** Uncontrolled initial value. */
  defaultValue?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Defaults to `name`. The first radio gets this id, so an ErrorSummary link can focus it. */
  id?: string;
};

/** A set of exclusive choices, each a large target. */
export function RadioGroup({ legend, name, options, defaultValue, hint, error, required, id: idProp }: RadioGroupProps) {
  const id = idProp ?? name;
  return (
    <Fieldset legend={legend} hint={hint} error={error} id={`${id}-group`}>
      {options.map((option, index) => {
        const optionId = index === 0 ? id : `${id}-${index + 1}`;
        const optionHintId = option.hint ? `${optionId}-hint` : undefined;
        return (
          <div key={option.value} className={styles.option}>
            <div className={styles.row}>
              <input
                type="radio"
                id={optionId}
                name={name}
                value={option.value}
                defaultChecked={defaultValue === option.value}
                disabled={option.disabled}
                required={required}
                aria-describedby={optionHintId}
                className={styles.input}
              />
              <label htmlFor={optionId} className={styles.label}>
                {option.label}
              </label>
            </div>
            {option.hint && <Hint id={optionHintId}>{option.hint}</Hint>}
          </div>
        );
      })}
    </Fieldset>
  );
}
