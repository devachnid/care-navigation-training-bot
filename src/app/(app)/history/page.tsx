import type { Metadata } from 'next';
import Link from 'next/link';
import type { SessionStatus } from '@/db/schema';
import { listOwnSessions, type SessionListItem } from '@/sessions/dal';
import { formatClock } from '@/call/limit';
import { Button, DataTable, EmptyState, PageHeader, Tag } from '@/ui';
import { requireAbility } from '@/app/_lib/guard';

export const metadata: Metadata = { title: 'My calls' };

const STATUS: Record<SessionStatus, string> = {
  created: 'Not started',
  in_call: 'Not finished',
  debriefing: 'Debrief in progress',
  complete: 'Complete',
  too_short: 'Too short (fail)',
  failed: 'Debrief failed',
};

const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });

export default async function HistoryPage() {
  const actor = await requireAbility('sessions.viewOwn');
  const rows = await listOwnSessions(actor);

  return (
    <>
      <PageHeader
        title="My calls"
        lead={`Your calls at ${actor.membership.practiceName}. Managers at your practice can see them too.`}
        actions={<Button href="/">Choose a call</Button>}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="You have not made any calls yet"
          action={
            <Button href="/" size="large">
              Choose a call
            </Button>
          }
        >
          Your calls will be listed here, with your score for each.
        </EmptyState>
      ) : (
        <DataTable<SessionListItem>
          caption="Your calls, newest first"
          rows={rows}
          rowKey={r => r.id}
          columns={[
            { key: 'when', header: 'When', nowrap: true, cell: r => when.format(r.startedAt) },
            { key: 'title', header: 'Call', rowHeader: true, cell: r => <Link href={`/debrief/${r.id}`}>{r.title}</Link> },
            {
              key: 'length',
              header: 'Length',
              numeric: true,
              nowrap: true,
              cell: r => (r.durationSeconds === null ? '–' : formatClock(r.durationSeconds)),
            },
            {
              key: 'result',
              header: 'Result',
              cell: r => (
                <>
                  {STATUS[r.status]} {r.unsafe && <Tag tone="unsafe">Unsafe</Tag>}
                </>
              ),
            },
            { key: 'score', header: 'Score', numeric: true, nowrap: true, cell: r => (r.score === null ? '–' : `${r.score}%`) },
          ]}
        />
      )}
    </>
  );
}
