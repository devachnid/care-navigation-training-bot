import type { Metadata } from 'next';
import { getDraftsAllowed } from '@/scenarios/approval-dal';
import { listVisibleScenarios } from '@/scenarios/practice-dal';
import { listMyProgress } from '@/sessions/progress-dal';
import { can } from '@/policy/can';
import { Button, EmptyState, PageHeader } from '@/ui';
import { requireAbility } from '@/app/_lib/guard';
import { ScenarioList } from './scenario-list';

export const metadata: Metadata = { title: 'Choose a call' };

/**
 * What to say on a draft scenario's card: true for this person and this practice. Staff only see a draft
 * when the practice lets them; managers and approvers always do.
 */
function draftNote(opts: { manages: boolean; approves: boolean; draftsAllowed: boolean }): string {
  if (!opts.manages) {
    return 'No clinician has approved this scenario yet, so its answer key has not been checked. Your practice lets staff practise on drafts like this one. Your debrief will say so.';
  }
  const who = opts.draftsAllowed
    ? 'Staff can practise it because your practice lets staff practise on drafts.'
    : 'Staff cannot see it until it is approved. You can try it because you manage scenarios.';
  return `No clinician has approved this scenario yet. ${who}${opts.approves ? ' You can approve it on the Scenarios page.' : ''}`;
}

export default async function HomePage() {
  const actor = await requireAbility('calls.take');
  const manages = can(actor, 'scenarios.manage');
  const [scenarios, progress, draftsAllowed] = await Promise.all([
    listVisibleScenarios(actor),
    listMyProgress(actor),
    // Only people who manage scenarios may read the setting; staff see drafts only when it is on.
    manages ? getDraftsAllowed(actor) : Promise.resolve(true),
  ]);
  const note = draftNote({ manages, approves: can(actor, 'scenarios.approve'), draftsAllowed });

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
        <ScenarioList scenarios={cards} draftNote={note} />
      ) : manages ? (
        <EmptyState
          title="Your practice has no scenarios to call yet"
          action={
            <Button href="/scenarios" size="large">
              Go to scenarios
            </Button>
          }
        >
          Add scenarios from the library, or show some to staff, so your team has something to practise.
        </EmptyState>
      ) : (
        <EmptyState title="There are no calls to practise yet">
          Your practice manager needs to get some scenarios approved by a clinician. Ask them, then come back.
        </EmptyState>
      )}
    </>
  );
}
