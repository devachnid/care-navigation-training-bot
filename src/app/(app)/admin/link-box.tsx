'use client';

import { useEffect, useRef } from 'react';
import { Alert, CopyField } from '@/ui';
import { formatDateTime } from '@/app/_lib/dates';
import type { OneTimeLink } from './state';

/** The one-time link and what to do with it. Only ever rendered from an action's response. */
export function LinkBox({ link, kind, message }: { link: OneTimeLink; kind: 'invitation' | 'reset'; message?: string }) {
  const url = `${window.location.origin}${link.path}`;
  const lasts = kind === 'invitation' ? '7 days' : '24 hours';
  const box = useRef<HTMLDivElement>(null);
  // The button pressed can be well away from the link: move focus to it so nobody has to hunt for it.
  useEffect(() => {
    box.current?.focus();
  }, []);
  return (
    <div ref={box} tabIndex={-1}>
    <Alert tone="success" title={message}>
      <p>
        Copy the link below and send it to {link.name} yourself. It works once and lasts {lasts} (until {formatDateTime(new Date(link.expiresAt))}).
        We do not send it, and we will not show it again.
      </p>
      <CopyField label={`${kind === 'invitation' ? 'Invitation' : 'Password reset'} link for ${link.name}`} value={url} />
    </Alert>
    </div>
  );
}
