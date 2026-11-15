import type { ZodError } from 'zod';
import { VOICES, type ScenarioContent } from './types';

/**
 * Turning a scenario form into the content object the backend validates, and a validation error
 * back into messages for the right field. Pure: no request, no database.
 *
 * Field names (also the element ids, so an error summary can link to them):
 * - single fields: `title`, `difficulty`, `personaName`, `personaAge`, `personaDescription`, `voice`,
 *   `openingLine`, `presentingStory`, `emotionalState`, `correctOutcome`
 * - hidden fact rows: `hiddenFacts-<n>-fact` and `hiddenFacts-<n>-unlockedBy`
 * - plain lists: `acceptableAlternatives-<n>`, `redFlags-<n>`, `unsafeOutcomes-<n>`
 * `<n>` is only an identifier for the row. Rows may be numbered with gaps (after a row is removed);
 * their order is the numeric order of `<n>`.
 */

export const SINGLE_FIELDS = [
  'title',
  'difficulty',
  'personaName',
  'personaAge',
  'personaDescription',
  'voice',
  'openingLine',
  'presentingStory',
  'emotionalState',
  'correctOutcome',
] as const;

export const TEXT_LISTS = ['acceptableAlternatives', 'redFlags', 'unsafeOutcomes'] as const;
export type TextList = (typeof TEXT_LISTS)[number];
export type ListName = 'hiddenFacts' | TextList;
export type Rows = Record<ListName, number[]>;

/** Field names in the order they appear on the page: for ordering an error summary. */
export const FIELD_ORDER: readonly string[] = [
  'personaName',
  'personaAge',
  'personaDescription',
  'voice',
  'openingLine',
  'presentingStory',
  'hiddenFacts',
  'emotionalState',
  'correctOutcome',
  'acceptableAlternatives',
  'redFlags',
  'unsafeOutcomes',
  'title',
  'difficulty',
];

const ROW_NAME = /^(hiddenFacts)-(\d+)-(fact|unlockedBy)$|^(acceptableAlternatives|redFlags|unsafeOutcomes)-(\d+)$/;

/** Every scenario field the form submitted, as strings, to give back to the form after a failed save. */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== 'string') continue;
    if ((SINGLE_FIELDS as readonly string[]).includes(name) || ROW_NAME.test(name)) out[name] = value;
  }
  return out;
}

/** The row numbers present in a set of values, in order. */
export function rowsOf(values: Record<string, string>): Rows {
  const sets: Record<ListName, Set<number>> = {
    hiddenFacts: new Set(),
    acceptableAlternatives: new Set(),
    redFlags: new Set(),
    unsafeOutcomes: new Set(),
  };
  for (const name of Object.keys(values)) {
    const m = ROW_NAME.exec(name);
    if (!m) continue;
    if (m[1]) sets.hiddenFacts.add(Number(m[2]));
    else sets[m[4] as TextList].add(Number(m[5]));
  }
  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return {
    hiddenFacts: sorted(sets.hiddenFacts),
    acceptableAlternatives: sorted(sets.acceptableAlternatives),
    redFlags: sorted(sets.redFlags),
    unsafeOutcomes: sorted(sets.unsafeOutcomes),
  };
}

/** A saved scenario as form values, rows numbered from 0. */
export function valuesFromContent(c: ScenarioContent): Record<string, string> {
  const v: Record<string, string> = {
    title: c.title,
    difficulty: c.difficulty,
    personaName: c.persona.name,
    personaAge: String(c.persona.age),
    personaDescription: c.persona.description,
    voice: c.voice,
    openingLine: c.openingLine,
    presentingStory: c.presentingStory,
    emotionalState: c.emotionalState,
    correctOutcome: c.correctOutcome,
  };
  c.hiddenFacts.forEach((h, i) => {
    v[`hiddenFacts-${i}-fact`] = h.fact;
    v[`hiddenFacts-${i}-unlockedBy`] = h.unlockedBy;
  });
  for (const list of TEXT_LISTS) c[list].forEach((t, i) => (v[`${list}-${i}`] = t));
  return v;
}

export type ParsedScenarioForm = {
  /** What to hand to the backend's schema. */
  input: unknown;
  /** Every row that was on the form. */
  rows: Rows;
  /** The plain-list rows that went into `input` (blank ones are left out). */
  kept: Record<TextList, number[]>;
};

/**
 * The content object for the backend from submitted values.
 * - A fact row is always kept, even when empty, so an empty row is reported rather than ignored.
 * - A blank row in a plain list (alternatives, red flags, unsafe outcomes) is dropped: those lists may be empty.
 * - A blank or non-numeric age gives `undefined` or `NaN`, which the schema refuses.
 */
export function parseScenarioForm(formData: FormData): ParsedScenarioForm {
  const values = formValues(formData);
  const rows = rowsOf(values);
  const get = (n: string) => values[n] ?? '';
  const ageText = get('personaAge').trim();
  const kept: Record<TextList, number[]> = { acceptableAlternatives: [], redFlags: [], unsafeOutcomes: [] };
  const lists = {} as Record<TextList, string[]>;
  for (const list of TEXT_LISTS) {
    lists[list] = [];
    for (const n of rows[list]) {
      const t = get(`${list}-${n}`);
      if (t.trim() === '') continue;
      kept[list].push(n);
      lists[list].push(t);
    }
  }
  const input = {
    title: get('title'),
    difficulty: get('difficulty'),
    persona: {
      name: get('personaName'),
      age: ageText === '' ? undefined : Number(ageText),
      description: get('personaDescription'),
    },
    voice: get('voice'),
    openingLine: get('openingLine'),
    presentingStory: get('presentingStory'),
    hiddenFacts: rows.hiddenFacts.map(n => ({ fact: get(`hiddenFacts-${n}-fact`), unlockedBy: get(`hiddenFacts-${n}-unlockedBy`) })),
    emotionalState: get('emotionalState'),
    correctOutcome: get('correctOutcome'),
    ...lists,
  };
  return { input, rows, kept };
}

const REQUIRED: Record<string, string> = {
  title: 'Enter a title.',
  difficulty: 'Choose a difficulty.',
  personaName: "Enter the caller's name.",
  personaAge: "Enter the caller's age, for example 54.",
  personaDescription: 'Describe the caller in a sentence or two.',
  voice: 'Choose a voice.',
  openingLine: 'Enter what the caller says first.',
  presentingStory: 'Enter what the caller is ringing about.',
  emotionalState: 'Describe how the caller is feeling.',
  correctOutcome: 'Enter the correct outcome.',
};

const NAMES: Record<string, string> = {
  title: 'The title',
  personaName: "The caller's name",
  personaDescription: 'The description',
  openingLine: 'The opening line',
  presentingStory: 'The story',
  emotionalState: 'How they feel',
  correctOutcome: 'The correct outcome',
};

const LIST_WORDS: Record<ListName, string> = {
  hiddenFacts: 'what they only say if asked',
  acceptableAlternatives: 'acceptable alternatives',
  redFlags: 'red flags',
  unsafeOutcomes: 'unsafe outcomes',
};

type Issue = ZodError['issues'][number] & { maximum?: number | bigint };

const tooLong = (subject: string, issue: Issue) => `${subject} is too long. Use ${String(issue.maximum)} characters or fewer.`;

/**
 * Field-keyed messages for a zod error from the scenario schema, using the same names as the form
 * (see the top of this file). Anything not tied to a field comes back under `form`. One message per field.
 */
export function fieldErrors(error: ZodError, parsed: ParsedScenarioForm): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, message: string) => {
    if (!(key in out)) out[key] = message;
  };
  const age = (parsed.input as { persona: { age: unknown } }).persona.age;

  for (const raw of error.issues) {
    const issue = raw as Issue;
    const [a, b, c] = issue.path;
    const tooBig = issue.code === 'too_big';

    if (a === 'persona') {
      if (b === 'age') {
        if (age === undefined) put('personaAge', REQUIRED.personaAge);
        else if (typeof age !== 'number' || !Number.isFinite(age)) put('personaAge', 'Enter the age as a number, for example 54.');
        else put('personaAge', 'The caller must be between 16 and 110 years old, in whole years.');
      } else if (b === 'name' || b === 'description') {
        const key = b === 'name' ? 'personaName' : 'personaDescription';
        put(key, tooBig ? tooLong(NAMES[key], issue) : REQUIRED[key]);
      } else put('form', 'Check the caller details.');
    } else if (a === 'hiddenFacts') {
      if (typeof b === 'number') {
        const n = parsed.rows.hiddenFacts[b];
        const field = c === 'unlockedBy' ? 'unlockedBy' : 'fact';
        if (n === undefined) put('hiddenFacts', 'Check what they only say if asked.');
        else if (tooBig) {
          put(`hiddenFacts-${n}-${field}`, `Row ${b + 1} of ${LIST_WORDS.hiddenFacts}: this is too long. Use ${String(issue.maximum)} characters or fewer.`);
        } else {
          const what = field === 'fact' ? 'enter the fact.' : 'say what kind of question brings it out.';
          put(`hiddenFacts-${n}-${field}`, `Row ${b + 1} of ${LIST_WORDS.hiddenFacts}: ${what}`);
        }
      } else if (tooBig) put('hiddenFacts', `Use ${String(issue.maximum)} rows or fewer in what they only say if asked.`);
      else put('hiddenFacts', 'Add at least one thing the caller only says if asked.');
    } else if (typeof a === 'string' && (TEXT_LISTS as readonly string[]).includes(a)) {
      const list = a as TextList;
      if (typeof b === 'number') {
        const n = parsed.kept[list][b];
        if (n === undefined) put(list, `Check ${LIST_WORDS[list]}.`);
        else {
          const position = parsed.rows[list].indexOf(n) + 1;
          const what = tooBig ? `this is too long. Use ${String(issue.maximum)} characters or fewer.` : 'enter some text, or remove the row.';
          put(`${list}-${n}`, `Row ${position} of ${LIST_WORDS[list]}: ${what}`);
        }
      } else put(list, `Use ${String(issue.maximum ?? 20)} rows or fewer in ${LIST_WORDS[list]}.`);
    } else if (typeof a === 'string' && a in REQUIRED) {
      put(a, tooBig ? tooLong(NAMES[a] ?? 'This', issue) : REQUIRED[a]);
    } else {
      put('form', 'Check the scenario and try again.');
    }
  }
  return inPageOrder(out);
}

const rankOf = (name: string) => {
  const i = FIELD_ORDER.findIndex(f => name === f || name.startsWith(`${f}-`));
  return i === -1 ? FIELD_ORDER.length : i;
};

/** The same messages with keys in the order the fields appear on the page (rows in row order), for an error summary. */
function inPageOrder(errors: Record<string, string>): Record<string, string> {
  const rows = (n: string) => Number(/-(\d+)(-|$)/.exec(n)?.[1] ?? 0);
  return Object.fromEntries(Object.entries(errors).sort(([a], [b]) => rankOf(a) - rankOf(b) || rows(a) - rows(b) || a.localeCompare(b)));
}

/** The voices as select options: "Alloy", "Ash", ... */
export const VOICE_OPTIONS = VOICES.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
