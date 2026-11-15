'use client';

import { Alert, CopyField } from '@/ui';
import { formatDateTime } from './format';
import type { LinkState } from './state';
import styles from './team.module.css';

/**
 * Shows a link the app will never show again. The address is built here in the browser from the
 * token held in the action's state; nothing is stored and the token is never put in a page address.
 */
export function OneTimeLink({ link, kind }: { link: NonNullable<LinkState['link']>; kind: 'invite' | 'reset' }) {
  const url = `${typeof window === 'undefined' ? '' : window.location.origin}/invite/${link.token}`;
  const expires = formatDateTime(new Date(link.expiresAt));
  const isInvite = kind === 'invite';
  return (
    <Alert tone="success" title={isInvite ? `Invitation link for ${link.name}` : `Password reset link${link.name ? ` for ${link.name}` : ''}`}>
      <div className={styles.link}>
        <CopyField label={isInvite ? 'Invitation link' : 'Password reset link'} value={url} />
        <ul className={styles.instructions}>
          <li>This link works once. After it has been used it stops working.</li>
          <li>
            It lasts {isInvite ? '7 days' : '24 hours'}, until {expires}.
          </li>
          <li>
            Pass it to {link.name || 'them'} yourself, for example in a message or in person. This service does not send email.
          </li>
          <li>
            <strong>It will not be shown again.</strong> Copy it now.
            {isInvite ? ' If you lose it, cancel the invitation and make a new one.' : ' If you lose it, make a new one.'}
          </li>
        </ul>
      </div>
    </Alert>
  );
}
