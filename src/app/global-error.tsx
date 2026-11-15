'use client';

import './globals.css';

// Replaces the whole page when the root layout itself fails, so it brings its own <html> and <body>.
// Plain markup only: the app shell and router links may be what broke.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en-GB">
      <body>
        <main style={{ maxWidth: '36rem', margin: '0 auto', padding: '4rem 1rem' }}>
          <title>Something went wrong</title>
          <h1>Something went wrong</h1>
          <p>That was our fault, not yours. Try again. If it keeps happening, tell your practice manager.</p>
          <p>
            <button type="button" onClick={() => retry()} style={{ font: 'inherit', padding: '0.75rem 1.5rem' }}>
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
