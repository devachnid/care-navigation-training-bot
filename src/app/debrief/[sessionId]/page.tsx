import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActor } from '@/auth/current';
import { retryDebrief } from '@/app/actions';
import { RUBRIC, type QuotedPoint } from '@/debrief/rubric';
import { can } from '@/policy/can';
import { getDebrief, getSession, getTurns } from '@/sessions/dal';

function Points({ title, points }: { title: string; points: QuotedPoint[] }) {
  if (points.length === 0) return null;
  return (
    <section>
      <h2>{title}</h2>
      <ul className="points">
        {points.map((p, i) => (
          <li key={i}>
            <p>{p.point}</p>
            <blockquote>“{p.quote}”</blockquote>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function DebriefPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const actor = await requireActor();
  if (!can(actor, 'sessions.viewOwn')) notFound();
  const { sessionId } = await params;
  const session = await getSession(actor, sessionId);
  if (!session) notFound();
  const scenario = session.scenario;
  const [debrief, turns] = await Promise.all([getDebrief(actor, sessionId), getTurns(actor, sessionId).then(t => t ?? [])]);

  return (
    <main>
      <p className="eyebrow">Debrief</p>
      <h1>{scenario.title}</h1>

      {!scenario.approved && (
        <p className="notice">Draft scenario. The answer key had not been approved by your practice when this call was made.</p>
      )}

      {session.status === 'too_short' && (
        <>
          <p className="alert" role="alert">
            <strong>Fail. Score 0.</strong> The call ended in under 20 seconds, or before you spoke, so it could not be assessed.
          </p>
        </>
      )}

      {session.status === 'failed' && session.isOwn && (
        <>
          <p className="alert" role="alert">
            The debrief could not be produced. Your transcript is saved below.
          </p>
          <form action={retryDebrief}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <button className="button">Try the debrief again</button>
          </form>
        </>
      )}

      {(session.status === 'created' || session.status === 'in_call') && (
        <p className="notice">
          This call was not finished, so there is no debrief. <Link href="/">Start a new call</Link>.
        </p>
      )}

      {session.status === 'debriefing' && <p className="notice">The debrief is still being prepared. Reload this page in a moment.</p>}

      {session.status === 'complete' && debrief && (
        <>
          {debrief.unsafeOutcome && (
            <p className="alert alert-unsafe" role="alert">
              <strong>Unsafe outcome.</strong> {scenario.unsafeOutcomes[0] ?? 'The red flag in this call was not acted on.'}
            </p>
          )}
          <dl className="summary">
            <div>
              <dt>Score</dt>
              <dd>{debrief.overallScore}%</dd>
            </div>
            <div>
              <dt>Outcome correct</dt>
              <dd>{debrief.outcomeCorrect ? 'Yes' : 'No'}</dd>
            </div>
            {debrief.redFlagHandled !== null && (
              <div>
                <dt>Red flag handled</dt>
                <dd>{debrief.redFlagHandled ? 'Yes' : 'No'}</dd>
              </div>
            )}
          </dl>
          <p>
            <strong>Expected outcome:</strong> {scenario.correctOutcome}
          </p>

          {debrief.rubricScores && (
            <section>
              <h2>Scores</h2>
              <table className="rubric">
                <thead>
                  <tr>
                    <th scope="col">Area</th>
                    <th scope="col">Score</th>
                    <th scope="col">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {RUBRIC.map(r => {
                    const item = debrief.rubricScores![r.key];
                    return (
                      <tr key={r.key}>
                        <th scope="row">{r.label}</th>
                        <td className="score">{item ? `${item.score} / 2` : 'n/a'}</td>
                        <td>{item ? item.justification : 'This scenario has no red flag.'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
          <Points title="What went well" points={debrief.strengths} />
          <Points title="What to work on" points={debrief.improvements} />
        </>
      )}

      <section>
        <h2>Transcript</h2>
        {turns.length === 0 ? (
          <p>Nothing was said on this call.</p>
        ) : (
          <ol className="transcript">
            {turns.map(t => (
              <li key={t.sequence} className={t.speaker}>
                <span className="who">{t.speaker === 'trainee' ? 'You' : 'Caller'}</span>
                <span>{t.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="actions">
        <Link className="button" href="/">
          Choose another call
        </Link>
        <Link href="/history">My past calls</Link>
      </p>
    </main>
  );
}
