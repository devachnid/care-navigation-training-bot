import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { requireTrainee } from '@/access/require';
import { getDb } from '@/db/client';
import { debriefs, scenarios, sessions, type SessionStatus } from '@/db/schema';

const STATUS: Record<SessionStatus, string> = {
  created: 'Not started',
  in_call: 'Not finished',
  debriefing: 'Debrief in progress',
  complete: 'Complete',
  too_short: 'Too short (fail)',
  failed: 'Debrief failed',
};

const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });
const clock = (s: number | null) => (s === null ? '–' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

export default async function HistoryPage() {
  const name = await requireTrainee();
  const rows = await getDb()
    .select({
      id: sessions.id,
      startedAt: sessions.startedAt,
      durationSeconds: sessions.durationSeconds,
      status: sessions.status,
      title: scenarios.title,
      score: debriefs.overallScore,
      unsafe: debriefs.unsafeOutcome,
    })
    .from(sessions)
    .innerJoin(scenarios, eq(sessions.scenarioId, scenarios.id))
    .leftJoin(debriefs, eq(debriefs.sessionId, sessions.id))
    .where(eq(sessions.traineeName, name))
    .orderBy(desc(sessions.startedAt))
    .limit(200);

  return (
    <main>
      <h1>My past calls</h1>
      <p className="lead">Calls made under the name {name}.</p>
      {rows.length === 0 ? (
        <p>No calls yet.</p>
      ) : (
        <table className="history">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Call</th>
              <th scope="col">Length</th>
              <th scope="col">Result</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{when.format(r.startedAt)}</td>
                <td>
                  <Link href={`/debrief/${r.id}`}>{r.title}</Link>
                </td>
                <td>{clock(r.durationSeconds)}</td>
                <td>
                  {STATUS[r.status]}
                  {r.unsafe && <span className="tag tag-hard">unsafe</span>}
                </td>
                <td>{r.score === null ? '–' : `${r.score}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="actions">
        <Link className="button" href="/">
          Choose a call
        </Link>
      </p>
    </main>
  );
}
