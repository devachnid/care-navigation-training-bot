import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getPracticeDetail,
  getPracticeUsageByMonth,
  listPendingManagerInvitations,
  listPracticePeople,
} from '@/admin/dal';
import { Alert, ConfirmButton, DataTable, PageHeader, Section, Tag } from '@/ui';
import { requireAbility } from '@/app/_lib/guard';
import { revokeInvitationAction, setSuspendedAction } from '../../actions';
import { InviteForm } from '../../invite-form';
import { PeopleTable, type PersonRow } from '../../people-table';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Practice (admin)' };

const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });
const day = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Europe/London' });

export default async function AdminPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAbility('platform.admin');
  const { id } = await params;
  const practice = await getPracticeDetail(actor, id);
  if (!practice) notFound();

  const [pending, people, usage] = await Promise.all([
    listPendingManagerInvitations(actor, practice.id),
    listPracticePeople(actor, practice.id),
    getPracticeUsageByMonth(actor, practice.id),
  ]);

  const rows: PersonRow[] = people.map(p => ({
    userId: p.userId,
    name: p.name,
    email: p.email,
    role: p.role === 'manager' ? 'Manager' : 'Trainee',
    approver: p.canApproveScenarios,
    active: p.active,
    disabled: p.disabled,
    lastSignIn: p.lastSignInAt ? when.format(p.lastSignInAt) : 'Never',
  }));

  return (
    <>
      <PageHeader eyebrow="Practice" title={practice.name} back={{ href: '/admin', label: 'All practices' }} />

      <Section title="State">
        <dl className={styles.details}>
          <dt>State</dt>
          <dd>{practice.suspended ? <Tag tone="draft">Suspended</Tag> : <Tag tone="approved">Active</Tag>}</dd>
          <dt>Added</dt>
          <dd>{day.format(practice.createdAt)}</dd>
          {practice.suspendedAt && (
            <>
              <dt>Suspended on</dt>
              <dd>{when.format(practice.suspendedAt)}</dd>
            </>
          )}
        </dl>
        {practice.suspended && (
          <Alert tone="warning" title="This practice is suspended">
            Nobody at the practice can sign in to it or take calls. Nothing has been deleted.
          </Alert>
        )}
        <p className={styles.note}>
          {practice.suspended
            ? 'Resuming lets everyone at the practice sign in and take calls again.'
            : 'Suspending means nobody at the practice can sign in to it or take calls. Nothing is deleted, and you can resume it at any time.'}
        </p>
        <form action={setSuspendedAction} className={styles.inline}>
          <input type="hidden" name="practiceId" value={practice.id} />
          <input type="hidden" name="suspended" value={practice.suspended ? 'false' : 'true'} />
          {practice.suspended ? (
            <ConfirmButton
              label="Resume this practice"
              question={`Everyone at ${practice.name} will be able to sign in again.`}
              confirmLabel="Yes, resume"
              variant="primary"
            />
          ) : (
            <ConfirmButton
              label="Suspend this practice"
              question={`Nobody at ${practice.name} will be able to sign in to it or take calls.`}
              confirmLabel="Yes, suspend"
            />
          )}
        </form>
      </Section>

      <Section title="Invite a manager" description="Use this for the practice's first manager, or to replace one who is locked out.">
        <InviteForm practiceId={practice.id} />
      </Section>

      <Section title="Waiting to join" description="Manager invitations that have not been used yet.">
        <DataTable
          caption="Manager invitations waiting to be used"
          rows={pending}
          rowKey={i => i.id}
          empty="Nobody is waiting to join."
          columns={[
            { key: 'name', header: 'Name', rowHeader: true },
            { key: 'email', header: 'Email' },
            { key: 'createdAt', header: 'Invited', nowrap: true, cell: i => when.format(i.createdAt) },
            { key: 'expiresAt', header: 'Link stops working', nowrap: true, cell: i => when.format(i.expiresAt) },
            {
              key: 'revoke',
              header: 'Cancel',
              cell: i => (
                <form action={revokeInvitationAction}>
                  <input type="hidden" name="practiceId" value={practice.id} />
                  <ConfirmButton
                    label="Revoke"
                    question={`The link for ${i.name} will stop working.`}
                    confirmLabel="Yes, revoke"
                    name="invitationId"
                    value={i.id}
                  />
                </form>
              ),
            },
          ]}
        />
      </Section>

      <Section title="People" description="Everyone who has a place in this practice. A reset link works once and lasts 24 hours.">
        <PeopleTable people={rows} />
      </Section>

      <Section title="Usage by month" description="Calls and voice minutes for the last six months.">
        <DataTable
          caption="Usage by month"
          rows={[...usage].reverse()}
          rowKey={u => u.month}
          columns={[
            { key: 'label', header: 'Month', rowHeader: true },
            { key: 'calls', header: 'Calls', numeric: true },
            { key: 'voiceMinutes', header: 'Voice minutes', numeric: true },
          ]}
        />
      </Section>
    </>
  );
}
