import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyFlag } from '@/debrief/flags-dal';
import { RUBRIC, type QuotedPoint, type RubricScores } from '@/debrief/rubric';
import { getDebrief, getSession, getTurns } from '@/sessions/dal';
import { Alert, Button, Card, DataTable, PageHeader, Section, Stat, StatGroup, SubmitButton } from '@/ui';
import { formatDate, formatDateTime, formatDuration } from '@/app/_lib/dates';
import { requireAbility } from '@/app/_lib/guard';
import { LATEST_RESULT } from '@/app/_lib/labels';
import stack from '@/app/_lib/stack.module.css';
import { retryDebriefAction } from './actions';
import styles from './debrief.module.css';
import { FlagPanel } from './flag-form';

export async function generateMetadata({ params }: { params: Promise<{ sessionId: string }> }): Promise<Metadata> {
  const actor = await requireAbility('sessions.viewOwn');
  const session = await getSession(actor, (await params).sessionId);
  if (!session) notFound();
  return { title: `Debrief: ${session.scenario.title}` };
}

// Trying the debrief again runs the assessor model from this page, which can take a while.
export const maxDuration = 120;

function Points({ title, points }: { title: string; points: QuotedPoint[] }) {
  if (points.length === 0) return null;
  return (
    <Section title={title}>
      <ul className={styles.points}>
        {points.map((p, i) => (
          <li key={i}>
            <Card>
              <p>{p.point}</p>
              <blockquote className={styles.quote}>“{p.quote}”</blockquote>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

type RubricRow = { key: string; label: string; item: RubricScores[keyof RubricScores] };

export default async function DebriefPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const actor = await requireAbility('sessions.viewOwn');
  const { sessionId } = await params;
  const session = await getSession(actor, sessionId);
  if (!session) notFound();
  const scenario = session.scenario;
  const [debrief, turns, myFlag] = await Promise.all([
    getDebrief(actor, sessionId),
    getTurns(actor, sessionId).then(t => t ?? []),
    getMyFlag(actor, sessionId),
  ]);

  const called = `${formatDateTime(session.startedAt)}${session.durationSeconds === null ? '' : `. It lasted ${formatDuration(session.durationSeconds)}`}`;
  const rubric: RubricRow[] = debrief?.rubricScores
    ? RUBRIC.map(r => ({ key: r.key, label: r.label, item: debrief.rubricScores![r.key] }))
    : [];

  return (
    <>
      <PageHeader
        back={
          session.isOwn
            ? { href: '/history', label: 'My calls' }
            : { href: `/team/${session.userId}`, label: `${session.userName}’s calls` }
        }
        eyebrow="Debrief"
        title={scenario.title}
        lead={session.isOwn ? `Your call on ${called}.` : `${session.userName}’s call on ${called}.`}
      />

      <div className={stack.alerts}>
        {!scenario.approved && (
          <Alert tone="warning" title="Draft scenario">
            The answer key had not been approved by a clinician at your practice when this call was made.
          </Alert>
        )}

        {session.status === 'too_short' && (
          <Alert tone="error" title="Fail. Score 0.">
            The call ended in under 20 seconds, or before {session.isOwn ? 'you' : 'they'} spoke, so it could not be assessed.
          </Alert>
        )}

        {session.status === 'failed' && (
          <Alert tone="error" title="The debrief could not be produced.">
            {session.transcriptDeletedAt
              ? 'The transcript has since been deleted, so the debrief cannot be tried again.'
              : 'The transcript is saved below.'}
            {session.isOwn && !session.transcriptDeletedAt && session.debriefRetriesLeft === 0 && (
              <p>It has been tried three times. Start a new call to get a debrief.</p>
            )}
            {session.isOwn && !session.transcriptDeletedAt && session.debriefRetriesLeft > 0 && (
              <form action={retryDebriefAction}>
                <input type="hidden" name="sessionId" value={sessionId} />
                <SubmitButton pendingLabel="Trying again…">Try the debrief again</SubmitButton>
              </form>
            )}
          </Alert>
        )}

        {(session.status === 'created' || session.status === 'in_call') && (
          <Alert tone="info" title="This call was not finished, so there is no debrief.">
            {session.isOwn && <Link href="/">Start a new call</Link>}
          </Alert>
        )}

        {session.status === 'debriefing' && (
          <Alert tone="info" title="The debrief is still being prepared.">
            Reload this page in a moment.
          </Alert>
        )}
        {session.status === 'complete' && debrief?.unsafeOutcome && (
          <Alert tone="unsafe" title="Unsafe outcome">
            {scenario.unsafeOutcomes[0] ?? 'The red flag in this call was not acted on.'}
          </Alert>
        )}
      </div>

      {session.status === 'complete' && debrief && (
        <>
          <Section title="Result">
            <StatGroup label="Result of this call">
              <Stat
                label="Result"
                value={LATEST_RESULT[debrief.unsafeOutcome ? 'unsafe' : debrief.outcomeCorrect ? 'passed' : 'not_yet'].label}
                note={
                  debrief.unsafeOutcome
                    ? 'The caller was left at risk.'
                    : debrief.outcomeCorrect
                      ? 'The caller was sent to the right place.'
                      : 'The caller was not sent to the right place.'
                }
              />
              <Stat label="Score" value={`${debrief.overallScore}%`} />
              <Stat label="Outcome correct" value={debrief.outcomeCorrect ? 'Yes' : 'No'} />
              {debrief.redFlagHandled !== null && <Stat label="Red flag handled" value={debrief.redFlagHandled ? 'Yes' : 'No'} />}
            </StatGroup>
            <p className={styles.expected}>
              <strong>Expected outcome:</strong> {scenario.correctOutcome}
            </p>
          </Section>

          {rubric.length > 0 && (
            <Section title="Scores">
              <DataTable<RubricRow>
                caption="Score for each area"
                rows={rubric}
                rowKey={r => r.key}
                columns={[
                  { key: 'area', header: 'Area', rowHeader: true, cell: r => r.label },
                  { key: 'score', header: 'Score', nowrap: true, cell: r => (r.item ? `${r.item.score} / 2` : 'n/a') },
                  { key: 'why', header: 'Why', cell: r => (r.item ? r.item.justification : 'This scenario has no red flag.') },
                ]}
              />
            </Section>
          )}
          <Points title="What went well" points={debrief.strengths} />
          <Points title="What to work on" points={debrief.improvements} />
        </>
      )}

      <Section title="Transcript">
        {session.transcriptDeletedAt ? (
          <Alert tone="info" title="The transcript has been deleted">
            The transcript and quotes from this call were deleted on {formatDate(session.transcriptDeletedAt)}
            {session.retentionDays === null ? '' : `, because ${actor.membership.practiceName} keeps them for ${session.retentionDays} days`}. The
            scores are kept.
          </Alert>
        ) : turns.length === 0 ? (
          <p>Nothing was said on this call.</p>
        ) : (
          <ol className={styles.transcript}>
            {turns.map(t => (
              <li key={t.sequence} className={`${styles.turn} ${t.speaker === 'trainee' ? styles.trainee : ''}`}>
                <span className={styles.who}>{t.speaker === 'trainee' ? (session.isOwn ? 'You' : session.userName) : 'Caller'}</span>
                <span>{t.text}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {session.status === 'complete' && debrief && !session.transcriptDeletedAt && (
        <Section title="Report a problem with this debrief">
          <FlagPanel
            sessionId={sessionId}
            isOwn={session.isOwn}
            existing={myFlag ? { reason: myFlag.reason, resolved: myFlag.resolved } : null}
          />
        </Section>
      )}

      {session.isOwn && (
        <Button href="/" size="large">
          Choose another call
        </Button>
      )}
    </>
  );
}
