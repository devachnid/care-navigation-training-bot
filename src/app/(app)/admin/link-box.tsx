'use client';

import { Alert, CopyField } from '@/ui';
import type { OneTimeLink } from './state';

const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });

/** The one-time link and what to do with it. Only ever rendered from an action's response. */
export function LinkBox({ link, kind, message }: { link: OneTimeLink; kind: 'invitation' | 'reset'; message?: string }) {
  const url = `${window.location.origin}${link.path}`;
  const lasts = kind === 'invitation' ? '7 days' : '24 hours';
  return (
    <Alert tone="success" title={message}>
      <p>
        Copy the link below and send it to {link.name} yourself. It works once and lasts {lasts} (until {when.format(new Date(link.expiresAt))}).
        We do not send it, and we will not show it again.
      </p>
      <CopyField label={`${kind === 'invitation' ? 'Invitation' : 'Password reset'} link for ${link.name}`} value={url} />
    </Alert>
  );
}
