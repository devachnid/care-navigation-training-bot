import type { FormState } from '@/app/_lib/form';

/**
 * A one-time link, carried only in the action's response to the browser. It is never stored,
 * never put in a URL and not part of any page, so it is gone after a reload.
 */
export type OneTimeLink = {
  /** `/invite/<token>`; the browser adds the address of the site. */
  path: string;
  /** Who it is for, for the label. */
  name: string;
  /** ISO time the link stops working. */
  expiresAt: string;
};

export type LinkFormState = FormState & { link?: OneTimeLink };
