import Link from 'next/link';
import type { ReactNode } from 'react';
import { SkipLink } from './SkipLink';
import styles from './PublicShell.module.css';

export type PublicShellProps = {
  children: ReactNode;
};

/** Frame for signed-out pages (sign in, invitation, setup, privacy): product name, one narrow centred column, footer. */
export function PublicShell({ children }: PublicShellProps) {
  return (
    <div className={styles.shell}>
      <SkipLink />
      <header className={styles.header}>
        <p className={styles.product}>Care navigation call practice</p>
      </header>
      <main id="main" tabIndex={-1} className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <p>Training tool. Calls are simulated: never use real patient details.</p>
        <Link href="/privacy">Privacy notice</Link>
      </footer>
    </div>
  );
}
