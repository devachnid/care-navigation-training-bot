import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listAuditEntries, type AuditEntry } from '@/audit/dal';
import { getPracticeSettings } from '@/practices/dal';
import { DataTable, PageHeader, Section } from '@/ui';
import { requireAbility } from '@/app/_lib/guard';
import { formatDateTime } from '@/app/_lib/dates';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const actor = await requireAbility('practice.settings');
  const [settings, changes] = await Promise.all([getPracticeSettings(actor), listAuditEntries(actor, 50)]);
  if (!settings) notFound();

  return (
    <>
      <PageHeader title="Settings" lead={`How practice calls work at ${settings.name}.`} />

      <Section title="Your practice">
        <SettingsForm settings={settings} />
      </Section>

      <Section title="Recent changes" description="The last 50 changes to your team, scenarios and settings, newest first.">
        <DataTable<AuditEntry>
          caption="Recent changes to your practice, newest first"
          rows={changes}
          rowKey={r => r.id}
          empty="Nothing has changed yet."
          columns={[
            { key: 'when', header: 'When', nowrap: true, cell: r => formatDateTime(r.at) },
            { key: 'who', header: 'Who', cell: r => r.actorName ?? 'The service' },
            { key: 'what', header: 'What', rowHeader: true, cell: r => r.summary },
          ]}
        />
      </Section>
    </>
  );
}
