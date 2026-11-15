import type { Metadata } from 'next';
import Link from 'next/link';
import { can } from '@/policy/can';
import { getDraftsAllowed, listApprovalInfo, listApproverNames } from '@/scenarios/approval-dal';
import { listLibraryNotInPractice, listScenariosForManagement } from '@/scenarios/practice-dal';
import { Button, Card, DataTable, PageHeader, Section, Tag } from '@/ui';
import { requireAbility } from '@/app/_lib/guard';
import { LibraryList } from './library-list';
import { DIFFICULTY_LABEL, approvalLine } from './labels';
import styles from './scenarios.module.css';

// The title is worked out behind the same access check as the page, so someone who may not see this page
// gets the "Page not found" title, not the name of a page they were told does not exist.
export async function generateMetadata(): Promise<Metadata> {
  await requireAbility('scenarios.manage');
  return { title: 'Scenarios' };
}

const DIFFICULTY_RANK = { easy: 0, medium: 1, hard: 2 } as const;

export default async function ScenariosPage() {
  const actor = await requireAbility('scenarios.manage');
  const [list, approvals, library, approvers, draftsAllowed] = await Promise.all([
    listScenariosForManagement(actor),
    listApprovalInfo(actor),
    listLibraryNotInPractice(actor),
    listApproverNames(actor),
    getDraftsAllowed(actor),
  ]);

  const approvalById = new Map(approvals.map(a => [a.scenarioId, a]));
  const rows = list
    .map(s => {
      const a = approvalById.get(s.id);
      return { ...s, approvedRevision: a?.approvedRevision ?? null, approvedAt: a?.approvedAt ?? null, approvedByName: a?.approvedByName ?? null };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty] || a.title.localeCompare(b.title, 'en-GB'));

  return (
    <>
      <PageHeader
        title="Scenarios"
        lead="A scenario is one simulated phone call. Choose one to read it, change it, try it or approve it."
        actions={
          <Button href="/scenarios/new" size="large">
            Write a new scenario
          </Button>
        }
      />

      <Card tone="quiet" className={styles.intro}>
        <p>
          <strong>Draft</strong> means a clinician has not yet checked the scenario. <strong>Approved</strong> means a clinician has
          checked it, including its answer key, against your practice’s own protocols. If anyone changes an approved scenario it goes
          back to being a draft until a clinician approves it again.
        </p>
        <p>
          {draftsAllowed
            ? 'Your practice lets staff practise on drafts as well as approved scenarios (see Settings). Staff see every scenario that is shown.'
            : 'Staff only see scenarios that are approved and shown. Managers and clinicians who can approve can always try drafts.'}
        </p>
        <p>
          {approvers.length > 0 ? (
            <>
              <strong>Who can approve here:</strong> {approvers.join(', ')}.
            </>
          ) : (
            <>
              <strong>Nobody at your practice can approve scenarios yet.</strong>{' '}
              {can(actor, 'team.manage') ? (
                <>
                  Go to the <Link href="/team">Team page</Link> and give a clinician permission to approve scenarios. Until then,
                  scenarios stay as drafts.
                </>
              ) : (
                <>Ask your practice manager to give a clinician that permission on the Team page.</>
              )}
            </>
          )}
        </p>
      </Card>

      <Section title="Your scenarios">
        <DataTable
          caption="Your practice’s scenarios"
          rows={rows}
          rowKey={r => r.id}
          empty="Your practice has no scenarios yet. Add one from the library below, or write your own."
          columns={[
            {
              key: 'title',
              header: 'Scenario',
              rowHeader: true,
              cell: r => <Link href={`/scenarios/${r.id}`}>{r.title}</Link>,
            },
            { key: 'difficulty', header: 'Difficulty', cell: r => <Tag tone={r.difficulty}>{DIFFICULTY_LABEL[r.difficulty]}</Tag> },
            {
              key: 'status',
              header: 'Status',
              cell: r =>
                r.approved ? (
                  <Tag tone="approved">Approved</Tag>
                ) : (
                  <Tag tone="draft">{r.approvedRevision !== null ? 'Changed since approval' : 'Draft'}</Tag>
                ),
            },
            { key: 'active', header: 'Shown to staff', cell: r => <Tag>{r.active ? 'Shown' : 'Hidden'}</Tag> },
            { key: 'approval', header: 'Approval', cell: r => approvalLine(r) },
          ]}
        />
      </Section>

      {library.length > 0 && (
        <Section
          title="Add from the library"
          description="Ready-made scenarios. An added scenario is a draft: check it, change what does not fit your practice, and have a clinician approve it."
        >
          <LibraryList items={library} />
        </Section>
      )}
    </>
  );
}
