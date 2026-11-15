'use client';

import { useActionState } from 'react';
import { Alert, Checkbox, ErrorSummary, Field, SubmitButton } from '@/ui';
import { initialFormState, summaryItems } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import { saveSettingsAction } from './actions';

const ORDER = ['name', 'allowDraftScenarios', 'retention'];

const CHOICES: { days: number | null; label: string }[] = [
  { days: null, label: 'Keep until deleted' },
  { days: 90, label: '90 days' },
  { days: 180, label: '180 days' },
  { days: 365, label: '1 year' },
  { days: 730, label: '2 years' },
];

export type SettingsValues = { name: string; allowDraftScenarios: boolean; transcriptRetentionDays: number | null };

export function SettingsForm({ settings }: { settings: SettingsValues }) {
  const [state, action] = useActionState(saveSettingsAction, initialFormState);
  const e = state.errors ?? {};
  const v = state.values;
  const failedBefore = v !== undefined && !state.success;
  const retention = failedBefore ? v.retention : settings.transcriptRetentionDays === null ? '' : String(settings.transcriptRetentionDays);
  const choices = [...CHOICES];
  if (settings.transcriptRetentionDays !== null && !choices.some(c => c.days === settings.transcriptRetentionDays)) {
    choices.push({ days: settings.transcriptRetentionDays, label: `${settings.transcriptRetentionDays} days` });
  }
  return (
    <form action={action} noValidate className={forms.form}>
      <ErrorSummary errors={summaryItems(state, ORDER)} focusToken={state} />
      {state.success && state.message && <Alert tone="success">{state.message}</Alert>}
      <Field
        label="Practice name"
        name="name"
        autoComplete="off"
        defaultValue={failedBefore ? v.name : settings.name}
        error={e.name}
        required
      />
      <Checkbox
        name="allowDraftScenarios"
        label="Let staff practise on draft scenarios"
        hint="A draft is a scenario that no clinician at your practice has approved yet. Its answer key has not been checked against your protocols. Staff who take a call on a draft see a notice saying so, and the debrief says so too. Managers and approvers can always try drafts, whatever you choose here."
        defaultChecked={failedBefore ? v.allowDraftScenarios === 'on' : settings.allowDraftScenarios}
        error={e.allowDraftScenarios}
      />
      <Field
        label="Keep transcripts for"
        name="retention"
        as="select"
        hint="How long the written record of each call is kept. Automatic deletion takes effect once it has been switched on for the whole service, which has not happened yet. Until then transcripts are kept whatever you choose here, and your choice is saved ready for when it starts."
        defaultValue={retention}
        error={e.retention}
        key={retention}
      >
        {choices.map(c => (
          <option key={String(c.days)} value={c.days === null ? '' : String(c.days)}>
            {c.label}
          </option>
        ))}
      </Field>
      <div className={forms.actions}>
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      </div>
    </form>
  );
}
