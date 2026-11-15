'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Alert, Card, SubmitButton, Tag, VisuallyHidden } from '@/ui';
import { initialFormState } from '@/app/_lib/form';
import { DIFFICULTY_LABEL, LATEST_RESULT } from '@/app/_lib/labels';
import stack from '@/app/_lib/stack.module.css';
import { startCallAction } from './actions';
import styles from './home.module.css';

export type ScenarioCardData = {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  approved: boolean;
  /** The person's own progress; null if they have not had a call assessed on this scenario. */
  progress: { attempts: number; bestScore: number; latest: 'passed' | 'not_yet' | 'unsafe' } | null;
};


export function ScenarioList({ scenarios, draftNote }: { scenarios: ScenarioCardData[]; draftNote: string }) {
  const [state, action] = useActionState(startCallAction, initialFormState);
  const notice = useRef<HTMLDivElement>(null);
  // The button pressed may be far below the message: move focus to it when a call is refused.
  useEffect(() => {
    if (state.message) notice.current?.focus();
  }, [state]);
  return (
    <>
      {state.message && (
        <div ref={notice} tabIndex={-1} className={stack.alerts}>
          <Alert
            tone={state.errors?.limit ? 'warning' : 'error'}
            title={state.errors?.limit ? 'No more calls today' : 'The call could not start'}
          >
            {state.message}
          </Alert>
        </div>
      )}
      <ul className={styles.list}>
        {scenarios.map(s => (
          <li key={s.id}>
            <Card
              title={s.title}
              headingLevel={2}
              actions={
                <>
                  <Tag tone={s.difficulty}>{DIFFICULTY_LABEL[s.difficulty]}</Tag>
                  {!s.approved && <Tag tone="draft">Draft</Tag>}
                </>
              }
            >
              {!s.approved && <p className={styles.draftNote}>{draftNote}</p>}
              {s.progress ? (
                <dl className={styles.progress} aria-label={`Your progress on ${s.title}`}>
                  <div>
                    <dt>Calls made</dt>
                    <dd>{s.progress.attempts}</dd>
                  </div>
                  <div>
                    <dt>Best score</dt>
                    <dd>{s.progress.bestScore}%</dd>
                  </div>
                  <div>
                    <dt>Latest call</dt>
                    <dd>
                      <Tag tone={LATEST_RESULT[s.progress.latest].tone}>{LATEST_RESULT[s.progress.latest].label}</Tag>
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className={styles.none}>You have not made this call yet.</p>
              )}
              <form action={action} className={styles.start}>
                <input type="hidden" name="scenarioId" value={s.id} />
                <SubmitButton variant="go" size="large" pendingLabel="Starting…">
                  Start the call
                  <VisuallyHidden> {s.title}</VisuallyHidden>
                </SubmitButton>
              </form>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
