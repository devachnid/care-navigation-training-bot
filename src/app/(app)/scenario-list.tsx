'use client';

import { useActionState } from 'react';
import { Alert, Card, SubmitButton, Tag, VisuallyHidden } from '@/ui';
import { initialFormState } from '@/app/_lib/form';
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

const LATEST = {
  passed: { tone: 'approved', label: 'Passed' },
  not_yet: { tone: 'neutral', label: 'Not yet' },
  unsafe: { tone: 'unsafe', label: 'Unsafe' },
} as const;

const DIFFICULTY = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

export function ScenarioList({ scenarios }: { scenarios: ScenarioCardData[] }) {
  const [state, action] = useActionState(startCallAction, initialFormState);
  return (
    <>
      {state.message && (
        <div className={stack.alerts}>
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
              actions={
                <>
                  <Tag tone={s.difficulty}>{DIFFICULTY[s.difficulty]}</Tag>
                  {!s.approved && <Tag tone="draft">Draft</Tag>}
                </>
              }
            >
              {!s.approved && <p className={styles.draftNote}>A clinician has not approved this scenario yet. Use it to test.</p>}
              {s.progress ? (
                <dl className={styles.progress} aria-label={`Your progress on ${s.title}`}>
                  <div>
                    <dt>Attempts</dt>
                    <dd>{s.progress.attempts}</dd>
                  </div>
                  <div>
                    <dt>Best score</dt>
                    <dd>{s.progress.bestScore}%</dd>
                  </div>
                  <div>
                    <dt>Latest attempt</dt>
                    <dd>
                      <Tag tone={LATEST[s.progress.latest].tone}>{LATEST[s.progress.latest].label}</Tag>
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className={styles.none}>You have not done this one yet.</p>
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
