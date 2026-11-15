import type { ReactNode } from 'react';
import styles from './Stat.module.css';

export type StatGroupProps = {
  /** Names the group for screen readers, for example "Team summary, last 30 days". */
  label: string;
  children: ReactNode;
};

export type StatProps = {
  /** What is being counted. */
  label: ReactNode;
  /** The number or short value. */
  value: ReactNode;
  /** Small note under the value, such as "up from 61 last month". */
  note?: ReactNode;
};

/** A row of Stat tiles. Renders a description list. */
export function StatGroup({ label, children }: StatGroupProps) {
  return (
    <dl aria-label={label} className={styles.group}>
      {children}
    </dl>
  );
}

/** One big number with its label. Use inside StatGroup. */
export function Stat({ label, value, note }: StatProps) {
  return (
    <div className={styles.stat}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
      {note && <dd className={styles.note}>{note}</dd>}
    </div>
  );
}
