import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './Tag.module.css';

export type TagTone = 'neutral' | 'easy' | 'medium' | 'hard' | 'draft' | 'approved' | 'unsafe';

export type TagProps = {
  tone?: TagTone;
  className?: string;
  /** The word itself carries the meaning; colour only supports it. */
  children: ReactNode;
};

/** A short status or difficulty label. Not interactive. */
export function Tag({ tone = 'neutral', className, children }: TagProps) {
  return <span className={cx(styles.tag, styles[tone], className)}>{children}</span>;
}
