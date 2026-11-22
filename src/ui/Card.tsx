import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './Card.module.css';

export type CardProps = {
  /** Heading inside the card. */
  title?: ReactNode;
  /** Heading level for `title`. Defaults to 3. */
  headingLevel?: 2 | 3 | 4;
  /** Buttons or links shown beside the title. */
  actions?: ReactNode;
  /** `quiet` has no border: for grouping inside another card or on white. */
  tone?: 'default' | 'quiet';
  as?: 'div' | 'section' | 'article' | 'li';
  className?: string;
  children?: ReactNode;
};

/** A white panel for one thing: a scenario, a person, a result. */
export function Card({ title, headingLevel = 3, actions, tone = 'default', as: Tag = 'div', className, children }: CardProps) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <Tag className={cx(styles.card, tone === 'quiet' && styles.quiet, className)}>
      {(title || actions) && (
        <div className={styles.head}>
          {title && <Heading className={styles.title}>{title}</Heading>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
