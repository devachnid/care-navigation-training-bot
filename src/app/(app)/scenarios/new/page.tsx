import type { Metadata } from 'next';
import { Section, PageHeader } from '@/ui';
import { requireAbility } from '@/app/_lib/guard';
import { ScenarioForm } from '../scenario-form';

// The title is worked out behind the same access check as the page, so someone who may not see this page
// gets the "Page not found" title, not the name of a page they were told does not exist.
export async function generateMetadata(): Promise<Metadata> {
  await requireAbility('scenarios.manage');
  return { title: 'Write a new scenario' };
}

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
