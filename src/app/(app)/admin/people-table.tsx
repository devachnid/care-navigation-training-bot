'use client';

import { useActionState } from 'react';
import { Alert, Button, DataTable, Tag, VisuallyHidden } from '@/ui';
import forms from '@/app/_lib/forms.module.css';
import { resetLinkAction } from './actions';
import { LinkBox } from './link-box';
import type { LinkFormState } from './state';

export type PersonRow = {
  userId: string;
  name: string;
  email: string;
  role: 'Manager' | 'Trainee';
  approver: boolean;
  active: boolean;
  disabled: boolean;
  lastSignIn: string;
};

const initial: LinkFormState = {};

/** The people of a practice. One shared form, so a reset link appears once, above the table. */
export function PeopleTable({ people }: { people: PersonRow[] }) {
  const [state, action, pending] = useActionState(resetLinkAction, initial);
  return (
    <form action={action} className={forms.form}>
      {state.link && <LinkBox link={state.link} kind="reset" message={state.message} />}
      {!state.success && state.message && <Alert tone="error">{state.message}</Alert>}
      {people.map(p => (
        <input key={p.userId} type="hidden" name={`name-${p.userId}`} value={p.name} />
      ))}
      <DataTable
        caption="Staff in this practice"
        rows={people}
        rowKey={p => p.userId}
        empty="Nobody has joined yet. Invite a manager above."
        columns={[
          { key: 'name', header: 'Name', rowHeader: true, cell: p => p.name },
          { key: 'email', header: 'Email', cell: p => p.email },
          {
            key: 'role',
            header: 'Role',
            cell: p => (
              <>
                {p.role} {p.approver && <Tag tone="approved">Approver</Tag>}
              </>
            ),
          },
          { key: 'active', header: 'Status', cell: p => (p.active ? 'Active' : 'Not active') },
          { key: 'lastSignIn', header: 'Last signed in', nowrap: true },
          {
            key: 'reset',
            header: 'Password',
            cell: p =>
              p.disabled ? (
                'Account disabled'
              ) : (
                <Button type="submit" variant="secondary" name="userId" value={p.userId} disabled={pending}>
                  Create a password reset link<VisuallyHidden> for {p.name}</VisuallyHidden>
                </Button>
              ),
          },
        ]}
      />
    </form>
  );
}
