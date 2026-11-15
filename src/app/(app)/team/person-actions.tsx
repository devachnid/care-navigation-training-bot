'use client';

import { useActionState } from 'react';
import { Alert, Card, ConfirmButton, Field, SubmitButton } from '@/ui';
import { initialFormState, type FormState } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import { changeRoleAction, deactivateAction, reactivateAction, resetLinkAction, setApproverAction } from './actions';
import { OneTimeLink } from './one-time-link';
import type { LinkState } from './state';
import styles from './team.module.css';

/** What came back from the action: the backend's refusal in plain words, or a short confirmation. */
function Outcome({ state }: { state: FormState }) {
  if (state.errors?.role) {
    return (
      <Alert tone="error" role="alert">
        {state.errors.role}
      </Alert>
    );
  }
  if (!state.message) return null;
  return state.success ? (
    <Alert tone="success">{state.message}</Alert>
  ) : (
    <Alert tone="error" role="alert">
      {state.message}
    </Alert>
  );
}

type Person = { userId: string; name: string; role: 'trainee' | 'manager'; canApprove: boolean; active: boolean; isYou: boolean };

export function ChangeRole({ person }: { person: Person }) {
  const [state, action] = useActionState(changeRoleAction, initialFormState);
  return (
    <Card title="Role" headingLevel={3}>
      <form action={action} className={forms.form}>
        <input type="hidden" name="userId" value={person.userId} />
        <Field label="Role" name="role" as="select" hint="A manager can also manage the team, scenarios and settings." defaultValue={person.role} key={person.role}>
          <option value="trainee">Trainee</option>
          <option value="manager">Manager</option>
        </Field>
        <div className={forms.actions}>
          <SubmitButton pendingLabel="Saving…">Change role</SubmitButton>
        </div>
        <Outcome state={state} />
      </form>
    </Card>
  );
}

export function ChangeApprover({ person }: { person: Person }) {
  const [state, action] = useActionState(setApproverAction, initialFormState);
  return (
    <Card title="Approving scenarios" headingLevel={3}>
      <form action={action} className={forms.form}>
        <input type="hidden" name="userId" value={person.userId} />
        <input type="hidden" name="canApprove" value={person.canApprove ? 'false' : 'true'} />
        <p className={styles.explain}>
          {person.canApprove
            ? 'They are a clinician approver: they can check scenarios against your protocols and approve them.'
            : 'They cannot approve scenarios. Turn this on for a clinician who checks scenarios against your protocols.'}
        </p>
        <div className={forms.actions}>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            {person.canApprove ? 'Stop them approving scenarios' : 'Let them approve scenarios'}
          </SubmitButton>
        </div>
        <Outcome state={state} />
      </form>
    </Card>
  );
}

/** One state for both buttons, so the confirmation stays on screen when the button changes. */
const changeAccess = (prev: FormState, formData: FormData) =>
  formData.get('mode') === 'deactivate' ? deactivateAction(prev, formData) : reactivateAction(prev, formData);

export function ChangeAccess({ person }: { person: Person }) {
  const [state, action] = useActionState(changeAccess, initialFormState);
  return (
    <Card title="Access to your practice" headingLevel={3}>
      <form action={action} className={forms.form}>
        <input type="hidden" name="userId" value={person.userId} />
        <input type="hidden" name="mode" value={person.active ? 'deactivate' : 'reactivate'} />
        <p className={styles.explain}>
          {person.active
            ? 'Deactivating stops them signing in to your practice. Their calls and scores are kept.'
            : 'They are deactivated and cannot sign in to your practice. Reactivate them to give access back.'}
        </p>
        <div className={forms.actions}>
          {person.active ? (
            <ConfirmButton
              label="Deactivate"
              confirmLabel="Yes, deactivate"
              pendingLabel="Deactivating…"
              question={person.isYou ? 'You will not be able to sign in to your practice.' : `${person.name} will not be able to sign in.`}
            />
          ) : (
            <SubmitButton variant="secondary" pendingLabel="Reactivating…">
              Reactivate
            </SubmitButton>
          )}
        </div>
        <Outcome state={state} />
      </form>
    </Card>
  );
}

const initialLink: LinkState = {};

export function ResetLink({ person }: { person: Person }) {
  const [state, action] = useActionState(resetLinkAction, initialLink);
  return (
    <Card title="Forgotten password" headingLevel={3}>
      <form action={action} className={forms.form}>
        <input type="hidden" name="userId" value={person.userId} />
        <input type="hidden" name="personName" value={person.name} />
        <p className={styles.explain}>
          Make a link that lets {person.isYou ? 'you' : person.name} choose a new password. It works once and lasts 24 hours.
        </p>
        <div className={forms.actions}>
          <SubmitButton variant="secondary" pendingLabel="Making the link…">
            Create a password reset link
          </SubmitButton>
        </div>
        {state.link ? <OneTimeLink link={state.link} kind="reset" /> : <Outcome state={state} />}
      </form>
    </Card>
  );
}
