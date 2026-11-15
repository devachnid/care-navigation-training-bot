import styles from './call-layout.module.css';

/** No navigation during a call: nothing to click away to by accident. Access is checked by the page. */
export default function CallLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className={styles.main}>
      {children}
    </main>
  );
}
