import type { AriaRole, ReactNode } from 'react';
import { cx } from './cx';
import { VisuallyHidden } from './VisuallyHidden';
import styles from './Alert.module.css';

export type AlertTone = 'info' | 'success' | 'warning' | 'error' | 'unsafe';

export type AlertProps = {
  tone?: AlertTone;
  /** Short bold heading. */
  title?: ReactNode;
  /**
   * Defaults: "alert" for error and unsafe, "status" for success, none for info and warning
   * (those are part of the page, not an announcement). Pass "none" to force silence.
   */
  role?: AriaRole;
  className?: string;
  children?: ReactNode;
};

const WORDS: Record<AlertTone, string> = {
  info: 'Information',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  unsafe: 'Unsafe call',
};

const DEFAULT_ROLE: Partial<Record<AlertTone, AriaRole>> = { error: 'alert', unsafe: 'alert', success: 'status' };

/** A message boxed on the page. The tone is in the words (read aloud) as well as the colour. `unsafe` is for a call that put a patient at risk. */
export function Alert({ tone = 'info', title, role, className, children }: AlertProps) {
  const resolved = role === 'none' ? undefined : (role ?? DEFAULT_ROLE[tone]);
  return (
    <div role={resolved} className={cx(styles.alert, styles[tone], className)}>
      <VisuallyHidden>{WORDS[tone]}: </VisuallyHidden>
      {title && <p className={styles.title}>{title}</p>}
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}
