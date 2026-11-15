import type { Metadata } from 'next';
import { Section, PageHeader } from '@/ui';
import { requireAbility } from '@/app/_lib/guard';
import { ScenarioForm } from '../scenario-form';

export const metadata: Metadata = { title: 'Write a new scenario' };

export default async function NewScenarioPage() {
  await requireAbility('scenarios.manage');
  return (
    <>
      <PageHeader
        back={{ href: '/scenarios', label: 'All scenarios' }}
        title="Write a new scenario"
        lead="A new scenario starts as a draft. You can try it straight away; staff see it once a clinician has approved it."
      />
      <Section title="The scenario" description="Only managers and clinicians can see the answer key.">
        <ScenarioForm initialValues={{ voice: 'coral' }} approved={false} />
      </Section>
    </>
  );
}
