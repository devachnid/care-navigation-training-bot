import { PublicShell } from '@/ui';
import { NotFoundContent } from '@/app/_lib/not-found-content';

// Outside the (app) pages, and for addresses that match nothing at all. Pages in (app) have their own, inside the app frame.
export default function NotFound() {
  return (
    <PublicShell>
      <NotFoundContent />
    </PublicShell>
  );
}
