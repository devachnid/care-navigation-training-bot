import type { Metadata } from 'next';
import Link from 'next/link';
import { getServiceSummary, listPractices } from '@/admin/dal';
import { DataTable, PageHeader, Section, Stat, StatGroup, Tag } from '@/ui';
import { formatDate, formatMonth } from '@/app/_lib/dates';
import { requireAbility } from '@/app/_lib/guard';
import { AddPracticeForm } from './add-practice-form';

export const metadata: Metadata = { title: 'Admin' };


export default async function AdminPage() {
  const actor = await requireAbility('platform.admin');
  const now = new Date();
  const [summary, practices] = await Promise.all([getServiceSummary(actor, now), listPractices(actor, now)]);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Practices and usage" lead="Every practice using the service, and how much of the voice service they use. Voice calls cost money." />

      <Section title={`This month (${formatMonth(now)})`}>
        <StatGroup label={`Whole service, ${formatMonth(now)}`}>
          <Stat label="Practices" value={summary.practices} note={summary.suspendedPractices > 0 ? `${summary.suspendedPractices} suspended` : undefined} />
          <Stat label="Active staff" value={summary.activeStaff} />
          <Stat label="Calls" value={summary.calls} />
          <Stat label="Voice minutes" value={summary.voiceMinutes} />
        </StatGroup>
      </Section>

      <Section title="Practices" description="Calls and voice minutes are for the last 30 days.">
        <DataTable
          caption="Practices"
          rows={practices}
          rowKey={p => p.id}
          empty="No practices yet. Add the first one below."
          columns={[
            { key: 'name', header: 'Practice', rowHeader: true, cell: p => <Link href={`/admin/practices/${p.id}`}>{p.name}</Link> },
            { key: 'state', header: 'State', cell: p => (p.suspended ? <Tag tone="draft">Suspended</Tag> : <Tag tone="approved">Active</Tag>) },
            { key: 'activeStaff', header: 'Active staff', numeric: true },
            { key: 'calls30', header: 'Calls', numeric: true },
            { key: 'voiceMinutes30', header: 'Voice minutes', numeric: true },
            { key: 'lastCallAt', header: 'Last call', nowrap: true, cell: p => (p.lastCallAt ? formatDate(p.lastCallAt) : 'No calls yet') },
          ]}
        />
      </Section>

      <Section title="Add a practice" description="The practice starts with the library scenarios as drafts. Nobody can sign in to it until you invite its first manager.">
        <AddPracticeForm />
      </Section>
    </>
  );
}
