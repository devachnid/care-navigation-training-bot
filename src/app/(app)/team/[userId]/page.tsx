import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatClock } from '@/call/limit';
import { getMember } from '@/practices/dal';
import { listMemberProgress, type MemberScenarioProgress } from '@/practices/team-dal';
import { listPracticeSessions, type SessionListItem } from '@/sessions/dal';
import { DataTable, PageHeader, Section, Tag } from '@/ui';
import { requireAbility } from '@/app/_lib/guard';
import { formatDate, formatDateTime } from '@/app/_lib/dates';
import { CALL_STATUS, LATEST_RESULT, roleLabel } from '@/app/_lib/labels';
import { ChangeAccess, ChangeApprover, ChangeRole, ResetLink } from '../person-actions';
import styles from '../team.module.css';

export async function generateMetadata({ params }: { params: Promise<{ userId: string }> }): Promise<Metadata> {
  const actor = await requireAbility('team.manage');
  const person = await getMember(actor, (await params).userId);
  if (!person) notFound();
  return { title: `${person.name} | Team` };
}

export default async function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const actor = await requireAbility('team.manage');
  const { userId } = await params;
  const person = await getMember(actor, userId);
  if (!person) notFound();
  const [progress, calls] = await Promise.all([listMemberProgress(actor, person.userId), listPracticeSessions(actor, { userId: person.userId })]);

  const active = person.deactivatedAt === null;
  const isYou = person.userId === actor.userId;
  const who = { userId: person.userId, name: person.name, role: person.role, canApprove: person.canApproveScenarios, active, isYou };

  return (
    <>
      <PageHeader
        back={{ href: '/team', label: 'Team' }}
        eyebrow="Team"
        title={person.name}
        lead={isYou ? 'This is you. You cannot change your own role, approving or access: ask another manager.' : undefined}
      />

      <Section title="Details">
        <dl className={styles.details}>
          <dt>Email</dt>
          <dd>{person.email}</dd>
          <dt>Role</dt>
          <dd>
            <span className={styles.tags}>
              {roleLabel(person.role)}
              {person.canApproveScenarios && <Tag tone="approved">Approver</Tag>}
            </span>
          </dd>
          <dt>Status</dt>
          <dd>
            {active ? <Tag tone="approved">Active</Tag> : <Tag tone="draft">Deactivated</Tag>}
            {!active && person.deactivatedAt && <span className={styles.you}> since {formatDate(person.deactivatedAt)}</span>}
          </dd>
          <dt>Joined</dt>
          <dd>{formatDate(person.joinedAt)}</dd>
          <dt>Last signed in</dt>
          <dd>{person.lastSignInAt ? formatDateTime(person.lastSignInAt) : 'Not yet'}</dd>
        </dl>
      </Section>

      <Section title="Change what they can do">
        <div className={styles.cards}>
          <ChangeRole person={who} />
          <ChangeApprover person={who} />
          <ChangeAccess person={who} />
          <ResetLink person={who} />
        </div>
      </Section>

      <Section title="Progress by scenario" description="Calls that have a debrief, grouped by scenario.">
        <DataTable<MemberScenarioProgress>
          caption={`${person.name}’s progress by scenario`}
          rows={progress}
          rowKey={r => r.practiceScenarioId}
          empty="No calls with a debrief yet."
          columns={[
            { key: 'title', header: 'Scenario', rowHeader: true, cell: r => r.title },
            { key: 'attempts', header: 'Calls', numeric: true, cell: r => r.attempts },
            { key: 'best', header: 'Best score', numeric: true, nowrap: true, cell: r => `${r.bestScore}%` },
            {
              key: 'latest',
              header: 'Latest call',
              cell: r => <Tag tone={LATEST_RESULT[r.latest].tone}>{LATEST_RESULT[r.latest].label}</Tag>,
            },
          ]}
        />
      </Section>

      <Section title="Calls" description="Newest first. Choose a call to read its debrief.">
        <DataTable<SessionListItem>
          caption={`${person.name}’s calls, newest first`}
          rows={calls}
          rowKey={r => r.id}
          empty="No calls yet."
          columns={[
            { key: 'when', header: 'When', nowrap: true, cell: r => formatDateTime(r.startedAt) },
            { key: 'title', header: 'Scenario', rowHeader: true, cell: r => <Link href={`/debrief/${r.id}`}>{r.title}</Link> },
            {
              key: 'length',
              header: 'Length',
              numeric: true,
              nowrap: true,
              cell: r => (r.durationSeconds === null ? '–' : formatClock(r.durationSeconds)),
            },
            {
              key: 'result',
              header: 'What happened',
              cell: r => (
                <>
                  {CALL_STATUS[r.status]} {r.unsafe && <Tag tone="unsafe">Unsafe</Tag>}
                </>
              ),
            },
            { key: 'score', header: 'Score', numeric: true, nowrap: true, cell: r => (r.score === null ? '–' : `${r.score}%`) },
          ]}
        />
      </Section>
    </>
  );
}
