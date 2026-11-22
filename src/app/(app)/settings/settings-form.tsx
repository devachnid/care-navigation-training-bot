'use client';

import { useActionState, useState } from 'react';
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
  const [picked, setPicked] = useState<string | null>(null);
  const e = state.errors ?? {};
  const v = state.values;
  const failedBefore = v !== undefined && !state.success;
  const retention = failedBefore ? v.retention : settings.transcriptRetentionDays === null ? '' : String(settings.transcriptRetentionDays);
  const choices = [...CHOICES];
  if (settings.transcriptRetentionDays !== null && !choices.some(c => c.days === settings.transcriptRetentionDays)) {
    choices.push({ days: settings.transcriptRetentionDays, label: `${settings.transcriptRetentionDays} days` });
  }
  const chosen = picked ?? retention;
  const saved = settings.transcriptRetentionDays;
  // Choosing a shorter time than today's means older transcripts go at the next daily run.
  const shortening = chosen !== '' && (saved === null || Number(chosen) < saved);
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
        hint="Once a day, transcripts and the quoted lines in debriefs of calls older than this are deleted. Scores are kept. A deleted transcript cannot be brought back."
        defaultValue={retention}
        onChange={event => setPicked(event.target.value)}
        error={e.retention}
        key={retention}
      >
        {choices.map(c => (
          <option key={String(c.days)} value={c.days === null ? '' : String(c.days)}>
            {c.label}
          </option>
        ))}
      </Field>
      {shortening && (
        <Alert tone="warning" title="Older transcripts will be deleted" role="status">
          Calls that ended more than {chosen} days ago will have their transcripts and quoted lines deleted at the next daily run after you
          save. This cannot be undone.
        </Alert>
      )}
      <div className={forms.actions}>
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      </div>
    </form>
  );
}
