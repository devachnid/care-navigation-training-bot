import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export type EmptyStateProps = {
  /** Says what is missing: "No calls yet". */
  title: ReactNode;
  /** Says what to do about it. */
  children?: ReactNode;
  /** The obvious next step, usually a Button. */
  action?: ReactNode;
  /** Heading level for the title. Defaults to 2. */
  headingLevel?: 2 | 3;
};

/** What to show instead of a list or table with nothing in it. */
export function EmptyState({ title, children, action, headingLevel = 2 }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3';
  return (
    <div className={styles.empty}>
      <Heading className={styles.title}>{title}</Heading>
      {children && <p className={styles.body}>{children}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
