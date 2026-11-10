import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { currentTrainee } from '@/access/require';
import { getDb } from '@/db/client';
import { scenarios } from '@/db/schema';
import { signOut, startSession } from './actions';
import { EnterForm } from './enter-form';


const ORDER = { easy: 0, medium: 1, hard: 2 } as const;

export default async function Home() {
  const name = await currentTrainee();
  if (!name) {
    return (
      <main>
        <h1>Care navigation call practice</h1>
        <p className="lead">Practise taking calls with a simulated caller, then see how the call went.</p>
        <EnterForm />
      </main>
    );
  }

  const list = (
    await getDb()
      .select({ id: scenarios.id, title: scenarios.title, difficulty: scenarios.difficulty })
      .from(scenarios)
      .where(eq(scenarios.active, true))
      .orderBy(asc(scenarios.title))
  ).sort((a, b) => ORDER[a.difficulty] - ORDER[b.difficulty]);

  return (
    <main>
      <header className="topbar">
        <span>
          Signed in as <strong>{name}</strong>
        </span>
        <nav>
          <Link href="/history">My past calls</Link>
          <form action={signOut}>
            <button className="link">Sign out</button>
          </form>
        </nav>
      </header>
      <h1>Choose a call</h1>
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
    </main>
  );
}
