'use client';

import { useActionState } from 'react';
import { enter, type EnterState } from './actions';

export function EnterForm() {
  const [state, action, pending] = useActionState<EnterState, FormData>(enter, {});
  return (
    <form action={action} className="form">
      <label>
        Access code
        <input name="code" type="password" autoComplete="off" required autoFocus />
      </label>
      <label>
        Your name
        <input name="name" type="text" autoComplete="name" maxLength={60} defaultValue={state.name ?? ''} required />
      </label>
      {state.error && (
        <p className="alert" role="alert">
          {state.error}
        </p>
      )}
      <button className="button button-go" disabled={pending}>
        {pending ? 'Checking…' : 'Continue'}
      </button>
    </form>
  );
}
