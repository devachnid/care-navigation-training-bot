import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

export type PageHeaderProps = {
  /** Small line above the title, for the area or the person: "Team", "Aisha Rahman". */
  eyebrow?: ReactNode;
  /** The page's one h1. */
  title: ReactNode;
  /** One or two sentences under the title. */
  lead?: ReactNode;
  /** Buttons for the page's main actions, shown on the right on wide screens. */
  actions?: ReactNode;
  /** A "back" link above everything. */
  back?: { href: string; label: string };
};

/** The top of a page: optional back link, eyebrow, the h1, a lead and actions. */
export function PageHeader({ eyebrow, title, lead, actions, back }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {back && (
        <Link href={back.href} className={styles.back}>
          <span aria-hidden="true" className={styles.chevron}>&lsaquo;</span>
          {back.label}
        </Link>
      )}
      <div className={styles.row}>
        <div className={styles.text}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 className={styles.title}>{title}</h1>
          {lead && <p className={styles.lead}>{lead}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  );
}
