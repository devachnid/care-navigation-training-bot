import { useId } from 'react';
import type { ReactNode } from 'react';
import styles from './Section.module.css';

export type SectionProps = {
  title: ReactNode;
  /** Heading level. Defaults to 2. */
  headingLevel?: 2 | 3;
  /** One line under the heading. */
  description?: ReactNode;
  /** Buttons or links beside the heading. */
  actions?: ReactNode;
  children: ReactNode;
};

/** A titled block of a page. Labelled by its heading, so it is a landmark-free region for screen readers. */
export function Section({ title, headingLevel = 2, description, actions, children }: SectionProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as 'h2' | 'h3';
  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <div className={styles.head}>
        <div>
          <Heading id={headingId} className={headingLevel === 2 ? styles.h2 : styles.h3}>
            {title}
          </Heading>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}
