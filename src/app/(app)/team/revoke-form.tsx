'use client';

import { useActionState } from 'react';
import { ConfirmButton } from '@/ui';
import { initialFormState } from '@/app/_lib/form';
import { revokeInvitationAction } from './actions';
import styles from './team.module.css';

/** "Revoke" for one waiting invitation or reset link. A refusal is shown in words beside it. */
export function RevokeForm({ invitationId, who, kind }: { invitationId: string; who: string; kind: 'invite' | 'reset' }) {
  const [state, action] = useActionState(revokeInvitationAction, initialFormState);
  return (
    <form action={action} className={styles.inlineForm}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <ConfirmButton
        label={kind === 'invite' ? 'Cancel invitation' : 'Cancel link'}
        confirmLabel="Yes, cancel it"
        cancelLabel="No, keep it"
        pendingLabel="Cancelling…"
        question={kind === 'invite' ? `${who} will not be able to use the link.` : `The reset link for ${who} will stop working.`}
      />
      {state.message && !state.success && (
        <p role="alert" className={styles.refusal}>
          {state.message}
        </p>
      )}
    </form>
  );
}
