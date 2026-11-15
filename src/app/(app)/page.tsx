import type { Metadata } from 'next';
import { listVisibleScenarios } from '@/scenarios/practice-dal';
import { listMyProgress } from '@/sessions/progress-dal';
import { can } from '@/policy/can';
import { Button, EmptyState, PageHeader } from '@/ui';
import { requireAbility } from '@/app/_lib/guard';
import { ScenarioList } from './scenario-list';

export const metadata: Metadata = { title: 'Practise' };

export default async function HomePage() {
  const actor = await requireAbility('calls.take');
  const [scenarios, progress] = await Promise.all([listVisibleScenarios(actor), listMyProgress(actor)]);

  const cards = scenarios.map(s => ({
    id: s.id,
    title: s.title,
    difficulty: s.difficulty,
    approved: s.approved,
    progress: progress.get(s.id) ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Choose a call"
        lead="The caller is simulated. Do not use real patient information. Put your headset on before you start."
      />
      {cards.length > 0 ? (
        <ScenarioList scenarios={cards} />
      ) : can(actor, 'scenarios.manage') ? (
        <EmptyState
          title="Your practice has no scenarios to call yet"
          action={
            <Button href="/scenarios" size="large">
              Go to scenarios
            </Button>
          }
        >
          Add scenarios from the library, or switch some on, so your team has something to practise.
        </EmptyState>
      ) : (
        <EmptyState title="Your practice has no approved scenarios yet">
          Your practice manager needs to get some approved by a clinician. Ask them, then come back.
        </EmptyState>
      )}
    </>
  );
}
