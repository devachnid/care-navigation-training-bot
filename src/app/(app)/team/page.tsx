import type { Metadata } from 'next';
import Link from 'next/link';
import { listPendingInvitations, type PendingInvitation } from '@/auth/invitations';
import { listMembers, type Member } from '@/practices/dal';
import { listTeamStats, type TeamStats } from '@/practices/team-dal';
import { Button, DataTable, PageHeader, Section, Tag } from '@/ui';
import { requireAbility } from '@/app/_lib/guard';
import { formatDate, formatDateTime } from '@/app/_lib/dates';
import { roleLabel } from '@/app/_lib/labels';
import { InviteForm } from './invite-form';
import { RevokeForm } from './revoke-form';
import styles from './team.module.css';

// The title is worked out behind the same access check as the page, so someone who may not see this page
// gets the "Page not found" title, not the name of a page they were told does not exist.
export async function generateMetadata(): Promise<Metadata> {
  await requireAbility('team.manage');
  return { title: 'Team' };
}

type Row = Member & { stats: TeamStats | undefined };

const NO_CALLS: Omit<TeamStats, 'userId'> = { calls: 0, lastCallAt: null, averageScore: null, unsafeOutcomes: 0 };

export default async function TeamPage() {
  const actor = await requireAbility('team.manage');
  const [members, stats, pending] = await Promise.all([listMembers(actor), listTeamStats(actor), listPendingInvitations(actor)]);
  const byUser = new Map(stats.map(s => [s.userId, s]));
  const rows: Row[] = members.map(m => ({ ...m, stats: byUser.get(m.userId) }));
  const invites = pending.filter(p => p.kind === 'invite');
  const resets = pending.filter(p => p.kind === 'reset');

  return (
    <>
      <PageHeader
        title="Team"
        lead={`The staff at ${actor.membership.practiceName}, with how their practice calls are going. Choose a name to see their calls or to change what they can do.`}
        actions={<Button href="#invite">Invite someone</Button>}
      />

      <Section title="Staff in your practice">
        <DataTable<Row>
          caption="Staff in your practice, with their calls"
          rows={rows}
          rowKey={r => r.userId}
          columns={[
            {
              key: 'name',
              header: 'Name and email',
              rowHeader: true,
              cell: r => (
                <>
                  <Link href={`/team/${r.userId}`}>{r.name}</Link>
                  {r.userId === actor.userId && <span className={styles.you}> (you)</span>}
                  <span className={styles.email}>
                    {r.email.split('@')[0]}@<wbr />
                    {r.email.split('@').slice(1).join('@')}
                  </span>
                </>
              ),
            },
            {
              key: 'role',
              header: 'Role',
              cell: r => (
                <span className={styles.tags}>
                  {roleLabel(r.role)}
                  {r.canApproveScenarios && <Tag tone="approved">Approver</Tag>}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: r => (r.deactivatedAt ? <Tag tone="draft">Deactivated</Tag> : <Tag tone="approved">Active</Tag>),
            },
            { key: 'calls', header: 'Calls', numeric: true, cell: r => (r.stats ?? NO_CALLS).calls },
            {
              key: 'last',
              header: 'Last call',
              nowrap: true,
              cell: r => ((r.stats ?? NO_CALLS).lastCallAt ? formatDate((r.stats ?? NO_CALLS).lastCallAt!) : '–'),
            },
            {
              key: 'average',
              header: 'Average score',
              numeric: true,
              nowrap: true,
              cell: r => ((r.stats ?? NO_CALLS).averageScore === null ? '–' : `${(r.stats ?? NO_CALLS).averageScore}%`),
            },
            {
              key: 'unsafe',
              header: 'Unsafe calls',
              numeric: true,
              cell: r => {
                const n = (r.stats ?? NO_CALLS).unsafeOutcomes;
                return n > 0 ? <Tag tone="unsafe">{n}</Tag> : 0;
              },
            },
          ]}
        />
      </Section>

      <Section title="Waiting to join" description="People you have invited who have not set up their account yet.">
        <DataTable<PendingInvitation>
          caption="Invitations waiting to be used"
          rows={invites}
          rowKey={r => r.id}
          empty="Nobody is waiting to join."
          columns={[
            { key: 'name', header: 'Name', rowHeader: true, cell: r => r.name },
            { key: 'email', header: 'Email', cell: r => r.email },
            {
              key: 'role',
              header: 'Role',
              cell: r => (
                <span className={styles.tags}>
                  {r.role ? roleLabel(r.role) : ''}
                  {r.canApproveScenarios && <Tag tone="approved">Approver</Tag>}
                </span>
              ),
            },
            { key: 'expires', header: 'Link ends', nowrap: true, cell: r => formatDateTime(r.expiresAt) },
            {
              key: 'revoke',
              header: 'Action',
              cell: r => <RevokeForm invitationId={r.id} who={r.name} kind="invite" />,
            },
          ]}
        />
      </Section>

      {resets.length > 0 && (
        <Section title="Password reset links not yet used" description="Each works once. Cancel one if it was made by mistake.">
          <DataTable<PendingInvitation>
            caption="Password reset links waiting to be used"
            rows={resets}
            rowKey={r => r.id}
            columns={[
              { key: 'name', header: 'Name', rowHeader: true, cell: r => r.name },
              { key: 'email', header: 'Email', cell: r => r.email },
              { key: 'expires', header: 'Link ends', nowrap: true, cell: r => formatDateTime(r.expiresAt) },
              {
                key: 'revoke',
                header: 'Action',
                cell: r => <RevokeForm invitationId={r.id} who={r.name} kind="reset" />,
              },
            ]}
          />
        </Section>
      )}

      <div id="invite" className={styles.invite}>
        <Section
          title="Invite someone"
          description="You will get a link to pass on yourself. This service does not send email."
        >
          <InviteForm />
        </Section>
      </div>
    </>
  );
}
