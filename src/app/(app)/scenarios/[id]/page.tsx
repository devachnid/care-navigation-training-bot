import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can } from '@/policy/can';
import { listApproverNames } from '@/scenarios/approval-dal';
import { valuesFromContent } from '@/scenarios/form';
import { getScenario } from '@/scenarios/practice-dal';
import { Alert, Card, PageHeader, Section, SubmitButton, Tag } from '@/ui';
import { requireAbility } from '@/app/_lib/guard';
import { setVisibilityAction } from '../actions';
import { DIFFICULTY_LABEL, formatWhen } from '../labels';
import { ScenarioForm } from '../scenario-form';
import styles from '../scenarios.module.css';
import { ApproveForm, TryCallForm } from './status-forms';

export const metadata: Metadata = { title: 'Scenario' };

export default async function ScenarioPage(props: PageProps<'/scenarios/[id]'>) {
  const actor = await requireAbility('scenarios.manage');
  const { id } = await props.params;
  const scenario = await getScenario(actor, id);
  if (!scenario) notFound();

  const canApprove = can(actor, 'scenarios.approve');
  const approvers = scenario.approved ? [] : await listApproverNames(actor);
  const who = scenario.approvedByName ?? 'a clinician';
  const at = scenario.approvedAt ? ` on ${formatWhen(scenario.approvedAt)}` : '';

  return (
    <>
      <PageHeader
        back={{ href: '/scenarios', label: 'All scenarios' }}
        eyebrow="Scenario"
        title={scenario.title}
        lead={
          <>
            <Tag tone={scenario.difficulty}>{DIFFICULTY_LABEL[scenario.difficulty]}</Tag>
          </>
        }
      />

      <Section title="Status">
        <Card>
          <div className={styles.status}>
            <div>
              <p className={styles.statusLine}>
                {scenario.approved ? <Tag tone="approved">Approved</Tag> : <Tag tone="draft">Draft</Tag>}{' '}
                {scenario.approved ? (
                  <span>
                    Approved by {who}
                    {at}.
                  </span>
                ) : scenario.approvedRevision !== null ? (
                  <span>
                    Changed since it was approved by {who}
                    {at}. A clinician needs to approve the new version.
                  </span>
                ) : (
                  <span>A clinician has not approved this scenario yet.</span>
                )}
              </p>
              <p className={styles.statusLine}>
                <Tag>{scenario.active ? 'Shown' : 'Hidden'}</Tag>{' '}
                {scenario.active ? (
                  <span>
                    {scenario.approved
                      ? 'Staff can see and practise it.'
                      : 'Staff cannot practise it until it is approved, unless your practice allows drafts.'}
                  </span>
                ) : (
                  <span>No staff can see it. Show it again when you want them to practise it.</span>
                )}
              </p>
            </div>
            <div className={styles.statusButtons}>
              <TryCallForm scenarioId={scenario.id} disabled={!scenario.active} />
              <form action={setVisibilityAction}>
                <input type="hidden" name="scenarioId" value={scenario.id} />
                <input type="hidden" name="active" value={scenario.active ? 'false' : 'true'} />
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  {scenario.active ? 'Hide from staff' : 'Show to staff'}
                </SubmitButton>
              </form>
            </div>
          </div>
          {!scenario.active && <p className={styles.note}>Show it to staff first if you want to try the call: a hidden scenario cannot be called.</p>}
        </Card>
      </Section>

      {!scenario.approved && (
        <Section
          title="Approval"
          description="A clinician checks the scenario, and especially its answer key, against your practice’s own protocols."
        >
          {canApprove ? (
            <Card>
              <p className={styles.note}>Version last saved {formatWhen(scenario.updatedAt)}. Read the answer key below before you approve.</p>
              <ApproveForm scenarioId={scenario.id} revision={scenario.revision} />
            </Card>
          ) : (
            <Alert tone="info" title="You cannot approve scenarios">
              {approvers.length > 0 ? (
                <>Ask {approvers.join(', ')} to check and approve this one.</>
              ) : can(actor, 'team.manage') ? (
                <>
                  Nobody at your practice can approve scenarios yet. Go to the <Link href="/team">Team page</Link> and give a clinician
                  permission to approve scenarios.
                </>
              ) : (
                <>Nobody at your practice can approve scenarios yet. Ask your practice manager to give a clinician that permission.</>
              )}
            </Alert>
          )}
        </Section>
      )}

      <Section
        title="Edit this scenario"
        description="Everything here, including the answer key, can only be seen by managers and clinicians."
      >
        <ScenarioForm
          scenarioId={scenario.id}
          revision={scenario.revision}
          initialValues={valuesFromContent(scenario)}
          approved={scenario.approved}
        />
      </Section>
    </>
  );
}
