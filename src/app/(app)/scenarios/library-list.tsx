'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Alert, Card, SubmitButton, Tag, VisuallyHidden } from '@/ui';
import { initialFormState } from '@/app/_lib/form';
import stack from '@/app/_lib/stack.module.css';
import { addFromLibraryAction } from './actions';
import { DIFFICULTY_LABEL } from './labels';
import styles from './scenarios.module.css';

export type LibraryItem = { id: string; title: string; difficulty: 'easy' | 'medium' | 'hard' };

export function LibraryList({ items }: { items: LibraryItem[] }) {
  const [state, action] = useActionState(addFromLibraryAction, initialFormState);
  const notice = useRef<HTMLDivElement>(null);

  // Move focus to the message when an add is refused.
  useEffect(() => {
    if (state.message) notice.current?.focus();
  }, [state]);

  return (
    <>
      {state.message && (
        <div ref={notice} tabIndex={-1} className={stack.alerts}>
          <Alert tone="error" title="That scenario could not be added">
            {state.message}
          </Alert>
        </div>
      )}
      <ul className={styles.library}>
        {items.map(item => (
          <li key={item.id}>
            <Card>
              <form action={action} className={styles.libraryRow}>
                <input type="hidden" name="libraryScenarioId" value={item.id} />
                <span className={styles.libraryTitle}>
                  {item.title} <Tag tone={item.difficulty}>{DIFFICULTY_LABEL[item.difficulty]}</Tag>
                </span>
                <SubmitButton variant="secondary" pendingLabel="Adding…">
                  Add<VisuallyHidden> {item.title} to your scenarios</VisuallyHidden>
                </SubmitButton>
              </form>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
