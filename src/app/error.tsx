'use client';

import { PublicShell } from '@/ui';
import { ErrorContent } from '@/app/_lib/error-content';

export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <PublicShell>
      <ErrorContent error={error} retry={retry} />
    </PublicShell>
  );
}
