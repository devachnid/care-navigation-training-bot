import type { FormState } from '@/app/_lib/form';

/**
 * A one-time link, returned in the action's state and held only in the page's memory. The token is
 * never stored and never put in a URL. `expiresAt` is an ISO string so it can cross to the browser.
 */
export type LinkState = FormState & {
  link?: { token: string; expiresAt: string; name: string };
};
