import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavLinks } from './NavLinks';
import { SkipLink } from './SkipLink';
import styles from './AppShell.module.css';

export type AppShellProps = {
  /** The signed-in person's name. */
  userName: string;
  /** The active practice, or null for someone with no practice (a platform admin). */
  practiceName: string | null;
  /** Primary navigation, already filtered for what this person may see. */
  nav: { href: string; label: string }[];
  /** Server action that signs out. Rendered as `<form action={signOutAction}>`. */
  signOutAction: () => Promise<void>;
  children: ReactNode;
};

/** The signed-in page frame: skip link, header with navigation and account links, `<main id="main">`, footer. */
export function AppShell({ userName, practiceName, nav, signOutAction, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <SkipLink />
      <header className={styles.header}>
        <div className={styles.bar}>
          <p className={styles.brand}>
            <Link href="/" className={styles.product}>
              Care navigation call practice
            </Link>
            {practiceName && <span className={styles.practice}>{practiceName}</span>}
          </p>
          <div className={styles.account}>
            <span className={styles.user}>
              <span className={styles.userLabel}>Signed in as </span>
              <strong>{userName}</strong>
            </span>
            <Link href="/account" className={styles.accountLink}>
              My account
            </Link>
            <form action={signOutAction}>
              <button type="submit" className={styles.accountLink}>
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav aria-label="Main" className={styles.nav}>
          <NavLinks
            items={nav}
            listClassName={styles.navList}
            linkClassName={styles.navLink}
            currentClassName={styles.navCurrent}
          />
        </nav>
      </header>
      <main id="main" tabIndex={-1} className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p>Training tool. Calls are simulated: never use real patient details.</p>
          <Link href="/privacy">Privacy notice</Link>
        </div>
      </footer>
    </div>
  );
}
