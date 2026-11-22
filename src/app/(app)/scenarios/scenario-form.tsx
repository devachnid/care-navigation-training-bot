'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Alert, Button, ErrorSummary, Field, Fieldset, Section, SubmitButton, VisuallyHidden } from '@/ui';
import { initialFormState, summaryItems } from '@/app/_lib/form';
import forms from '@/app/_lib/forms.module.css';
import { VOICE_OPTIONS, rowsOf, type ListName, type Rows, type TextList } from '@/scenarios/form';
import { saveScenarioAction } from './actions';
import styles from './scenarios.module.css';

type Props = {
  /** Set when editing an existing scenario. */
  scenarioId?: string;
  /** The version the form was loaded with, sent back so a newer edit by someone else is not overwritten. */
  revision?: number;
  initialValues: Record<string, string>;
  /** Whether the scenario is approved now, to warn that saving makes it a draft. */
  approved: boolean;
};

export function ScenarioForm({ scenarioId, revision, initialValues, approved }: Props) {
  const [state, action] = useActionState(saveScenarioAction, initialFormState);
  const values = state.values ?? initialValues;
  const errors = state.errors ?? {};
  const saved = useRef<HTMLDivElement>(null);
  // Tell keyboard and screen reader users the save worked: the button they pressed is far below the message.
  useEffect(() => {
    if (state.success) saved.current?.focus();
  }, [state]);

  return (
    <form action={action} noValidate className={forms.form}>
      <ErrorSummary errors={summaryItems(state)} focusToken={state} />
      {state.success && state.message && (
        <div ref={saved} tabIndex={-1}>
          <Alert tone="success" title="Saved">
            {state.message}
          </Alert>
        </div>
      )}
      {scenarioId && <input type="hidden" name="scenarioId" value={scenarioId} />}
      {revision !== undefined && <input type="hidden" name="revision" value={revision} />}
      <FormBody key={revision ?? 'new'} values={values} errors={errors} />
      {approved && (
        <Alert tone="warning" title="This scenario is approved">
          If you save any change, it becomes a draft again. Staff will not see it until a clinician approves the new version.
        </Alert>
      )}
      <div className={forms.actions}>
        <SubmitButton size="large" pendingLabel="Saving…">
          {scenarioId ? 'Save changes' : 'Save scenario'}
        </SubmitButton>
      </div>
    </form>
  );
}

type RowState = { rows: Rows; next: Record<ListName, number> };

function startingRows(values: Record<string, string>, errors: Record<string, string>): RowState {
  const rows = rowsOf(values);
  // A new scenario starts with one empty fact row, unless the person already removed them all and was told off.
  if (rows.hiddenFacts.length === 0 && !errors.hiddenFacts) rows.hiddenFacts = [0];
  const nextOf = (r: number[]) => (r.length === 0 ? 0 : Math.max(...r) + 1);
  return {
    rows,
    next: {
      hiddenFacts: nextOf(rows.hiddenFacts),
      acceptableAlternatives: nextOf(rows.acceptableAlternatives),
      redFlags: nextOf(rows.redFlags),
      unsafeOutcomes: nextOf(rows.unsafeOutcomes),
    },
  };
}

const firstControlId = (list: ListName, n: number) => (list === 'hiddenFacts' ? `hiddenFacts-${n}-fact` : `${list}-${n}`);

function FormBody({ values, errors }: { values: Record<string, string>; errors: Record<string, string> }) {
  const [{ rows, next }, setRowState] = useState<RowState>(() => startingRows(values, errors));
  const [announcement, setAnnouncement] = useState('');
  const pendingFocus = useRef<string | null>(null);

  // After a row is added or removed, put focus somewhere sensible (set by the handler below).
  useEffect(() => {
    if (pendingFocus.current) {
      document.getElementById(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    }
  }, [rows]);

  function addRow(list: ListName, noun: string) {
    const n = next[list];
    pendingFocus.current = firstControlId(list, n);
    setRowState({ rows: { ...rows, [list]: [...rows[list], n] }, next: { ...next, [list]: n + 1 } });
    setAnnouncement(`Row added. ${noun}: ${rows[list].length + 1} rows.`);
  }

  function removeRow(list: ListName, n: number, noun: string) {
    const at = rows[list].indexOf(n);
    const rest = rows[list].filter(x => x !== n);
    const target = rest[at] ?? rest[at - 1];
    pendingFocus.current = target === undefined ? `${list}-add` : firstControlId(list, target);
    setRowState({ rows: { ...rows, [list]: rest }, next });
    setAnnouncement(`Row removed. ${noun}: ${rest.length} ${rest.length === 1 ? 'row' : 'rows'}.`);
  }

  const v = (name: string) => values[name];

  return (
    <>
      <VisuallyHidden>
        <span role="status" aria-live="polite">
          {announcement}
        </span>
      </VisuallyHidden>

      <Section title="Title and difficulty" description="What staff see when they choose a call. Do not put the answer in the title.">
        <div className={forms.form}>
          <Field
            label="Title"
            name="title"
            defaultValue={v('title')}
            error={errors.title}
            autoComplete="off"
            hint="A few words saying what the call is about. For example: “Sore throat”."
          />
          <Field label="Difficulty" name="difficulty" as="select" defaultValue={v('difficulty') ?? ''} error={errors.difficulty} hint="Easy: the right answer is clear and nothing is hidden. Medium: one detail changes the answer. Hard: something serious is buried, or the caller is hard to read.">
            <option value="">Choose a difficulty</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Field>
        </div>
      </Section>

      <Section title="The caller" description="Who is ringing. Use an invented person, never a real patient.">
        <div className={forms.form}>
          <Field label="Name" name="personaName" defaultValue={v('personaName')} error={errors.personaName} autoComplete="off" hint="An invented name, for example Delyth Morgan." />
          <Field
            label="Age"
            name="personaAge"
            type="number"
            inputMode="numeric"
            min={16}
            max={110}
            defaultValue={v('personaAge')}
            error={errors.personaAge}
            hint="In years, between 16 and 110."
          />
          <Field
            label="Description"
            name="personaDescription"
            as="textarea"
            rows={3}
            defaultValue={v('personaDescription')}
            error={errors.personaDescription}
            hint="Who they are and how they come across on the phone. For example: “Retired teacher, polite and matter-of-fact, does not want to waste anyone’s time.”"
          />
          <Field label="Voice" name="voice" as="select" defaultValue={v('voice') ?? 'coral'} error={errors.voice} hint="The voice the caller speaks with. Choose one that suits their age and mood.">
            {VOICE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Field>
        </div>
      </Section>

      <Section title="What they say" description="What the caller says without being asked.">
        <div className={forms.form}>
          <Field
            label="Opening line"
            name="openingLine"
            as="textarea"
            rows={2}
            defaultValue={v('openingLine')}
            error={errors.openingLine}
            hint="The first thing the caller says when the receptionist answers. Keep it short and natural. For example: “Hello, is that the surgery? I need an appointment with the doctor please.”"
          />
          <Field
            label="The story"
            name="presentingStory"
            as="textarea"
            rows={5}
            defaultValue={v('presentingStory')}
            error={errors.presentingStory}
            hint="What the caller is ringing about, and what they will say about it without being asked. Write it as if briefing an actor. For example: “She asks for a routine appointment about ‘something in my eye’. She says no more than that unless asked.”"
          />
        </div>
      </Section>

      <Section
        title="What they only say if asked"
        description="Things that are true about the caller but that they do not mention unless the receptionist asks the right question."
      >
        <Fieldset
          id="hiddenFacts"
          legend="Facts the caller keeps back"
          hint="Add at least one. Each row is one fact and the kind of question that brings it out. This is how the practice tests whether the receptionist asks enough questions."
          error={errors.hiddenFacts}
        >
          <ol className={styles.rows}>
            {rows.hiddenFacts.map((n, i) => (
              <li key={n} className={styles.row}>
                <p className={styles.rowTitle}>Row {i + 1}</p>
                <Field
                  label={`Row ${i + 1}: the fact`}
                  name={`hiddenFacts-${n}-fact`}
                  as="textarea"
                  rows={2}
                  defaultValue={v(`hiddenFacts-${n}-fact`)}
                  error={errors[`hiddenFacts-${n}-fact`]}
                  hint="Something true that the caller does not say first. For example: “It came on suddenly this morning.”"
                />
                <Field
                  label={`Row ${i + 1}: what kind of question brings it out`}
                  name={`hiddenFacts-${n}-unlockedBy`}
                  as="textarea"
                  rows={2}
                  defaultValue={v(`hiddenFacts-${n}-unlockedBy`)}
                  error={errors[`hiddenFacts-${n}-unlockedBy`]}
                  hint="When the caller should tell them. For example: “Asked when it started or how quickly it came on.”"
                />
                <div>
                  <Button variant="secondary" onClick={() => removeRow('hiddenFacts', n, 'What they only say if asked')}>
                    Remove<VisuallyHidden> row {i + 1} of what they only say if asked</VisuallyHidden>
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <div>
            <Button id="hiddenFacts-add" variant="secondary" onClick={() => addRow('hiddenFacts', 'What they only say if asked')}>
              Add a fact
            </Button>
          </div>
        </Fieldset>
      </Section>

      <Section title="How they feel" description="So the voice sounds right.">
        <Field
          label="Emotional state"
          name="emotionalState"
          as="textarea"
          rows={3}
          defaultValue={v('emotionalState')}
          error={errors.emotionalState}
          hint="How the caller feels, and how that changes depending on how the receptionist treats them. For example: “Calm and unworried, assumes it is something minor. Becomes concerned but cooperative if told it needs looking at today.”"
        />
      </Section>

      <Section
        title="The answer key"
        description="This is what the call is marked against. Only managers and clinicians can see it. A clinician approves it against your practice’s protocols."
      >
        <div className={forms.form}>
          <Field
            label="Correct outcome"
            name="correctOutcome"
            as="textarea"
            rows={3}
            defaultValue={v('correctOutcome')}
            error={errors.correctOutcome}
            hint="Where the call should end up, in your practice’s own words. For example: “Same-day urgent assessment by an optometrist, not a routine GP slot.”"
          />
          <TextList
            list="acceptableAlternatives"
            legend="Acceptable alternatives"
            hint="Other outcomes that are also fine. Leave empty if there is only one right answer."
            example="For example: “Pharmacy First, if the pharmacist can see them today.”"
            rowLabel="Alternative"
            addLabel="Add an alternative"
            noun="Acceptable alternatives"
            rows={rows.acceptableAlternatives}
            values={values}
            errors={errors}
            onAdd={addRow}
            onRemove={removeRow}
          />
          <TextList
            list="redFlags"
            legend="Red flags"
            hint="Signs of something serious that the receptionist must pick up on. Leave empty if there are none."
            example="For example: “Chest tightness at rest, started 30 minutes ago, not eased by the spray.”"
            rowLabel="Red flag"
            addLabel="Add a red flag"
            noun="Red flags"
            rows={rows.redFlags}
            values={values}
            errors={errors}
            onAdd={addRow}
            onRemove={removeRow}
          />
          <TextList
            list="unsafeOutcomes"
            legend="Unsafe outcomes"
            hint="Ways the call could end that would put the caller at risk. Leave empty if there are none."
            example="For example: “Booking a routine GP appointment and ending the call.”"
            rowLabel="Unsafe outcome"
            addLabel="Add an unsafe outcome"
            noun="Unsafe outcomes"
            rows={rows.unsafeOutcomes}
            values={values}
            errors={errors}
            onAdd={addRow}
            onRemove={removeRow}
          />
        </div>
      </Section>
    </>
  );
}

type TextListProps = {
  list: TextList;
  legend: string;
  hint: string;
  example: string;
  rowLabel: string;
  addLabel: string;
  noun: string;
  rows: number[];
  values: Record<string, string>;
  errors: Record<string, string>;
  onAdd: (list: ListName, noun: string) => void;
  onRemove: (list: ListName, n: number, noun: string) => void;
};

function TextList({ list, legend, hint, example, rowLabel, addLabel, noun, rows, values, errors, onAdd, onRemove }: TextListProps) {
  return (
    <Fieldset id={list} legend={legend} hint={`${hint} ${example}`} error={errors[list]}>
      {rows.length > 0 && (
        <ol className={styles.rows}>
          {rows.map((n, i) => (
            <li key={n} className={styles.row}>
              <Field
                label={`${rowLabel} ${i + 1}`}
                name={`${list}-${n}`}
                as="textarea"
                rows={2}
                defaultValue={values[`${list}-${n}`]}
                error={errors[`${list}-${n}`]}
              />
              <div>
                <Button variant="secondary" onClick={() => onRemove(list, n, noun)}>
                  Remove<VisuallyHidden> {rowLabel.toLowerCase()} {i + 1}</VisuallyHidden>
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div>
        <Button id={`${list}-add`} variant="secondary" onClick={() => onAdd(list, noun)}>
          {addLabel}
        </Button>
      </div>
    </Fieldset>
  );
}
