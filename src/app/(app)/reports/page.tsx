import type { Metadata } from 'next';
import Link from 'next/link';
import { listOpenFlags, type OpenFlag } from '@/debrief/flags-dal';
import {
  getScenarioBreakdown,
  getStaffMatrix,
  getSummary,
  listRecentUnsafe,
  type MatrixStaff,
  type ScenarioRow,
  type UnsafeCall,
} from '@/reports/dal';
import { PERIODS, PERIOD_LABEL, parsePeriod, type Period } from '@/reports/period';
import { Button, DataTable, EmptyState, PageHeader, Section, Stat, StatGroup, SubNav, SubmitButton, Tag, VisuallyHidden } from '@/ui';
import { formatDateTime } from '@/app/_lib/dates';
import { requireAbility } from '@/app/_lib/guard';
import { DIFFICULTY_LABEL, LATEST_RESULT } from '@/app/_lib/labels';
import { resolveFlagAction } from './actions';
import styles from './reports.module.css';

// The title is worked out behind the same access check as the page, so someone who may not see this page
// gets the "Page not found" title, not the name of a page they were told does not exist.
export async function generateMetadata(): Promise<Metadata> {
  await requireAbility('reports.view');
  return { title: 'Reports' };
}

const periodHref = (p: Period) => `/reports?period=${p}`;

export default async function ReportsPage(props: PageProps<'/reports'>) {
  const actor = await requireAbility('reports.view');
  const period = parsePeriod((await props.searchParams).period);
  const periodLabel = PERIOD_LABEL[period].toLowerCase();

  const [summary, matrix, breakdown, unsafe, flags] = await Promise.all([
    getSummary(actor, period),
    getStaffMatrix(actor, period),
    getScenarioBreakdown(actor, period),
    listRecentUnsafe(actor, period),
    listOpenFlags(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Reports"
        lead={`How call practice is going at ${actor.membership.practiceName}. Times are UK time.`}
        actions={
          summary.calls > 0 ? (
            // A plain form, not a Link: a Link would prefetch the download in the background.
            <form action="/reports/export" method="get">
              <input type="hidden" name="period" value={period} />
              <Button type="submit" variant="secondary">
                Download as a spreadsheet (CSV)
              </Button>
            </form>
          ) : undefined
        }
      />
      <SubNav
        label="Reporting period"
        current={periodHref(period)}
        items={PERIODS.map(p => ({
          href: periodHref(p),
          label: PERIOD_LABEL[p],
        }))}
      />

      {summary.calls === 0 ? (
        <EmptyState
          title={period === 'all' ? 'No calls yet' : `No calls in the ${periodLabel === 'all time' ? 'period' : periodLabel}`}
          action={
            period === 'all' ? (
              <Button href="/team" size="large">
                Invite your staff
              </Button>
            ) : (
              <Button href={periodHref('all')} size="large">
                Show all time
              </Button>
            )
          }
        >
          {period === 'all'
            ? 'When your staff have practised a call, you will see who has done what here.'
            : 'Nobody has finished a call in this time. Try a longer period, or ask your staff to practise.'}
        </EmptyState>
      ) : (
        <>
          <div className={styles.stats}>
            <StatGroup label={`Summary, ${periodLabel}`}>
              <Stat label="Calls taken" value={summary.calls} />
              <Stat label="Staff who practised" value={`${summary.staffPractised} of ${summary.totalStaff}`} />
              <Stat label="Average score" value={summary.averageScore === null ? '–' : `${summary.averageScore}%`} />
              <Stat label="Unsafe outcomes" value={summary.unsafe} />
            </StatGroup>
          </div>

          <Section
            title="Who has done what"
            description={`Each person’s latest call on each scenario, ${periodLabel}, with their best score. Select a result to read that debrief.`}
          >
            {matrix.scenarios.length === 0 ? (
              <EmptyState title="No scenarios are shown to staff" headingLevel={3}>
                Show at least one scenario to staff, so they have something to practise.
              </EmptyState>
            ) : (
              <DataTable<MatrixStaff>
                caption={`Latest result for each person and scenario, ${periodLabel}`}
                rows={matrix.staff}
                rowKey={r => r.userId}
                empty="There are no active staff in your practice."
                columns={[
                  {
                    key: 'name',
                    header: 'Person',
                    rowHeader: true,
                    cell: r => (
                      <Link href={`/team/${r.userId}`} className={styles.wrap}>
                        {r.name}
                      </Link>
                    ),
                  },
                  ...matrix.scenarios.map(s => ({
                    key: s.id,
                    header: (
                      <span className={styles.scenarioHead}>
                        {s.title}
                        <span className={styles.difficulty}>{DIFFICULTY_LABEL[s.difficulty]}</span>
                      </span>
                    ),
                    cell: (r: MatrixStaff) => {
                      const cell = r.cells[s.id];
                      if (!cell) return <span className={styles.notTried}>Not tried</span>;
                      return (
                        <Link href={`/debrief/${cell.sessionId}`} className={styles.result}>
                          <VisuallyHidden>
                            {r.name}, {s.title}, latest call:{' '}
                          </VisuallyHidden>
                          <Tag tone={LATEST_RESULT[cell.result].tone}>{LATEST_RESULT[cell.result].label}</Tag>
                          <span className={styles.best}>Best {cell.bestScore}%</span>
                        </Link>
                      );
                    },
                  })),
                ]}
              />
            )}
          </Section>

          <Section
            title="By scenario"
            description={`Every call made ${periodLabel}, including on scenarios that have since been changed or hidden.`}
          >
            <DataTable<ScenarioRow>
              caption={`Results for each scenario, ${periodLabel}`}
              rows={breakdown}
              rowKey={r => r.practiceScenarioId}
              columns={[
                {
                  key: 'title',
                  header: 'Scenario',
                  rowHeader: true,
                  cell: r => r.title,
                },
                {
                  key: 'difficulty',
                  header: 'Difficulty',
                  cell: r => DIFFICULTY_LABEL[r.difficulty],
                },
                {
                  key: 'attempts',
                  header: 'Calls',
                  numeric: true,
                  cell: r => r.attempts,
                },
                {
                  key: 'people',
                  header: 'People',
                  numeric: true,
                  cell: r => r.people,
                },
                {
                  key: 'passRate',
                  header: 'Passed',
                  numeric: true,
                  nowrap: true,
                  cell: r => `${r.passRate}%`,
                },
                {
                  key: 'averageScore',
                  header: 'Average score',
                  numeric: true,
                  nowrap: true,
                  cell: r => `${r.averageScore}%`,
                },
                {
                  key: 'unsafe',
                  header: 'Unsafe',
                  numeric: true,
                  cell: r => r.unsafe,
                },
              ]}
            />
          </Section>

          <Section title="Unsafe outcomes" description={`The most recent 20 calls ${periodLabel} where the caller was left at risk.`}>
            {unsafe.length === 0 ? (
              <EmptyState title="No unsafe outcomes" headingLevel={3}>
                No call {periodLabel} put a patient at risk. Well done.
              </EmptyState>
            ) : (
              <DataTable<UnsafeCall>
                caption={`Unsafe outcomes, ${periodLabel}, newest first`}
                rows={unsafe}
                rowKey={r => r.sessionId}
                columns={[
                  {
                    key: 'when',
                    header: 'When',
                    nowrap: true,
                    cell: r => formatDateTime(r.startedAt),
                  },
                  {
                    key: 'who',
                    header: 'Who',
                    rowHeader: true,
                    cell: r => <Link href={`/team/${r.userId}`}>{r.userName}</Link>,
                  },
                  { key: 'title', header: 'Scenario', cell: r => r.title },
                  {
                    key: 'debrief',
                    header: 'Debrief',
                    cell: r => (
                      <Link href={`/debrief/${r.sessionId}`} aria-label={`Read the debrief: ${r.userName}, ${r.title}`}>
                        Read the debrief
                      </Link>
                    ),
                  },
                ]}
              />
            )}
          </Section>
        </>
      )}

      {flags.length > 0 && (
        <Section
          title="Reported debrief problems"
          description="Staff think something is wrong with these debriefs. Read each one, then mark it as dealt with."
        >
          <DataTable<OpenFlag>
            caption="Debrief problems that nobody has dealt with yet, oldest first"
            rows={flags}
            rowKey={r => r.id}
            columns={[
              {
                key: 'who',
                header: 'Reported by',
                rowHeader: true,
                cell: r => <span className={styles.wrap}>{r.reportedByName}</span>,
              },
              {
                key: 'when',
                header: 'When',
                nowrap: true,
                cell: r => formatDateTime(r.createdAt),
              },
              {
                key: 'reason',
                header: 'What they said',
                cell: r => <span className={styles.reason}>{r.reason}</span>,
              },
              {
                key: 'debrief',
                header: 'Debrief',
                cell: r => (
                  <Link href={`/debrief/${r.sessionId}`} className={styles.wrap}>
                    {r.callerName}’s call: {r.title}
                  </Link>
                ),
              },
              {
                key: 'action',
                header: 'Action',
                cell: r => (
                  <form action={resolveFlagAction}>
                    <input type="hidden" name="flagId" value={r.id} />
                    <SubmitButton
                      variant="secondary"
                      pendingLabel="Saving…"
                      aria-label={`Mark as dealt with: problem reported by ${r.reportedByName}`}
                    >
                      Mark as dealt with
                    </SubmitButton>
                  </form>
                ),
              },
            ]}
          />
        </Section>
      )}
    </>
  );
}
