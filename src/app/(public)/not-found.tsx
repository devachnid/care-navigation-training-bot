import type { Metadata } from 'next';
import { NotFoundContent } from '@/app/_lib/not-found-content';

// For pages inside the (public) frame (for example /setup once it has been used): the frame is already there.
export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return <NotFoundContent />;
}
