'use client';

import { ErrorContent } from '@/app/_lib/error-content';

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorContent error={error} retry={retry} />;
}
