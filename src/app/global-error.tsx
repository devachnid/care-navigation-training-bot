'use client';

import './globals.css';
import styles from './global-error.module.css';

// Replaces the whole page when the root layout itself fails, so it brings its own <html> and <body>.
// Plain markup only: the app shell and router links may be what broke. No inline `style=`:
// the Content-Security-Policy blocks inline styles, so the layout comes from a CSS Module.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en-GB">
      <body>
        <main className={styles.main}>
          <title>Something went wrong</title>
          <h1>Something went wrong</h1>
          <p>That was our fault, not yours. Try again. If it keeps happening, tell your practice manager.</p>
          <p>
            <button type="button" onClick={() => retry()} className={styles.button}>
              Try again
            </button>
          </p>
          {/* A plain link on purpose: this page replaces the app, so there is no router to use. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">Go to the home page</a>
        </main>
      </body>
    </html>
  );
}
