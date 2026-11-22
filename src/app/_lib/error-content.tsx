'use client';

import { useEffect } from 'react';
import { Button, PageHeader } from '@/ui';
import forms from './forms.module.css';

/** Shared by the root and (app) `error.tsx`. Never shows the technical message: it can say more than a person should see. */
export function ErrorContent({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <>
      <PageHeader
        title="Something went wrong"
        lead="That was our fault, not yours. Try again. If it keeps happening, tell your practice manager."
      />
      <div className={forms.actions}>
        <Button size="large" onClick={() => retry()}>
          Try again
        </Button>
        <Button href="/" variant="secondary" size="large">
          Go to the home page
        </Button>
      </div>
    </>
  );
}
