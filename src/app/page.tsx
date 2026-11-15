import Link from 'next/link';
import { requireActor } from '@/auth/current';
import { can } from '@/policy/can';
import { listVisibleScenarios } from '@/scenarios/practice-dal';
import { signOut, startSession } from './actions';

// Interim page: the next engineer replaces it (design section 6).
export default async function Home() {
  const actor = await requireActor();
  const list = can(actor, 'calls.take') ? await listVisibleScenarios(actor) : [];

  return (
    <main>
      <header className="topbar">
        <span>
          Signed in as <strong>{actor.name}</strong>
          {actor.membership && <> at {actor.membership.practiceName}</>}
        </span>
        <nav>
          <Link href="/history">My past calls</Link>
          <form action={signOut}>
            <button className="link">Sign out</button>
          </form>
        </nav>
      </header>
      <h1>Choose a call</h1>
      {!actor.membership ? (
        <p className="notice">You are not a member of a practice at the moment. Ask your practice manager.</p>
      ) : (
        <>
          <p className="lead">The caller is simulated. No real patient information is used, and you should not use any.</p>
          <ul className="scenarios">
            {list.map(s => (
              <li key={s.id}>
                <form action={startSession}>
                  <input type="hidden" name="scenarioId" value={s.id} />
                  <button className="scenario">
                    <span className="scenario-title">{s.title}</span>
                    <span className={`tag tag-${s.difficulty}`}>{s.difficulty}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
