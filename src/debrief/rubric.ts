import { z } from 'zod';

/** What each score means for one rubric item, written so that two readers reach the same score. */
export type Anchors = { 0: string; 1: string; 2: string };

/**
 * The seven rubric items, each scored 0 to 2. Order is the order shown to the trainee.
 * `label` and `guide` are shown on the debrief page. `anchors` are for the assessor only: they are
 * put in its prompt and are not shown to the trainee. Change an anchor only after running the
 * evaluation set (docs/engineering/debrief-quality.md) and bump PROMPT_VERSION.
 */
export const RUBRIC = [
  {
    key: 'greeting',
    label: 'Greeting and identification',
    guide: 'Gave their name; checked who is calling and for whom.',
    anchors: {
      2: 'All three done: (a) gave their own name or the practice name, (b) asked for or confirmed the caller\'s name, and (c) asked or confirmed whether the call is for the caller or for someone else.',
      1: 'One or two of (a), (b) and (c) done. For example, gave their name and asked the caller\'s name but never checked who the call was for.',
      0: 'None of (a), (b) and (c) done.',
    },
  },
  {
    key: 'information',
    label: 'Information gathering',
    guide: 'Asked enough to navigate safely, including the questions that unlock hidden facts.',
    anchors: {
      2: 'The receptionist\'s own questions brought out every hidden fact that bears on the outcome (all of them, or all but one that does not change the outcome).',
      1: 'Some hidden facts were brought out, but at least one that bears on the outcome was never asked about.',
      0: 'None were brought out, or nothing was asked beyond what the caller said unprompted. A fact the caller volunteered without being asked does not count as brought out.',
    },
  },
  {
    key: 'redFlag',
    label: 'Red flag recognition',
    guide: 'Spotted the red flag and acted on it. Not applicable if the scenario has none.',
    anchors: {
      2: 'The whole red flag was brought to light by the receptionist\'s questions and acted on in the way the answer key says.',
      1: 'Urgency was recognised and something was done about it, but either only part of the red flag was brought to light, or the action did not fully match the answer key.',
      0: 'The red flag was missed, or it was found and nothing was done about it (for example, a routine appointment was offered, or the call ended with the original request processed).',
    },
  },
  {
    key: 'destination',
    label: 'Correct destination',
    guide: 'Matches the answer key or an acceptable alternative.',
    anchors: {
      2: 'The receptionist\'s final instruction to the caller is the correct outcome or a listed acceptable alternative.',
      1: 'The urgency was about right but the place or route was not the one in the answer key, or the receptionist left the caller to choose between the correct outcome and another.',
      0: 'The caller was sent somewhere that matches an unsafe outcome, or somewhere with the wrong urgency and the wrong place.',
    },
  },
  {
    key: 'role',
    label: 'Stayed in role',
    guide: "No diagnosis or clinical advice beyond the receptionist's remit.",
    anchors: {
      2: 'No diagnosis, no naming of a likely cause, no advice about medicines, doses or self-treatment, and no clinical reassurance. Asking about symptoms and giving the outcome in the answer key are in role.',
      1: 'One passing clinical remark, such as reassuring the caller that it is probably nothing serious, with no diagnosis and no medicine or dose advice.',
      0: 'Named or suggested a diagnosis or likely cause, or gave advice about a medicine, a dose or self-treatment.',
    },
  },
  {
    key: 'explanation',
    label: 'Explanation',
    guide: 'Told the caller where they are going, why, and what to do if things get worse.',
    anchors: {
      2: 'All three said: (a) where they are going or what happens next, (b) a reason for it, however brief ("it needs looking at today", "they can treat that", "it is quicker"), and (c) what to do if things get worse (call back or get urgent help). When the destination is 999, the instruction itself covers (c), so only (a) and (b) are needed. Do not mark down for missing detail such as service names or opening times.',
      1: 'Exactly two of (a), (b) and (c) said. Saying where to go with no reason is one of the three, not two.',
      0: 'Only one of the three said, or none.',
    },
  },
  {
    key: 'manner',
    label: 'Manner',
    guide: 'Empathy, clarity, handling of emotion or pushback.',
    anchors: {
      2: 'Polite, clear and unhurried throughout. Where the caller showed worry, embarrassment or pushback, the receptionist acknowledged or reassured them before moving on.',
      1: 'Polite and clear, but missed or brushed past an emotional cue or pushback, or was brisk.',
      0: 'Curt, impatient or dismissive; pressured the caller; or the caller withdrew because of how they were spoken to.',
    },
  },
] as const satisfies readonly { key: string; label: string; guide: string; anchors: Anchors }[];

export type RubricKey = (typeof RUBRIC)[number]['key'];

const item = z.object({
  score: z.number().int().min(0).max(2),
  justification: z.string().describe('One line explaining the score.'),
});

const point = z.object({
  point: z.string().describe('One specific observation, addressed to the receptionist.'),
  quote: z.string().describe('Exact words copied from one line of the transcript that support the point.'),
});

export const rubricScoresSchema = z.object({
  greeting: item,
  information: item,
  redFlag: item.nullable().describe('null when the scenario has no red flag.'),
  destination: item,
  role: item,
  explanation: item,
  manner: item,
});

/** How many strengths, and how many improvements, a debrief shows. */
export const MAX_POINTS = 3;
const MAX_POINTS_ACCEPTED = 8;

/** What the debrief model must return. */
export const debriefResultSchema = z.object({
  rubricScores: rubricScoresSchema,
  outcomeCorrect: z.boolean(),
  unsafeOutcome: z.boolean(),
  redFlagHandled: z.boolean().nullable().describe('null when the scenario has no red flag.'),
  // Asked for two or three of each. The model occasionally returns four, or one: accept up to
  // MAX_POINTS_ACCEPTED so that does not fail the whole debrief, and keep the first MAX_POINTS in code.
  strengths: z.array(point).max(MAX_POINTS_ACCEPTED),
  improvements: z.array(point).max(MAX_POINTS_ACCEPTED),
});

export type RubricScores = z.infer<typeof rubricScoresSchema>;
export type QuotedPoint = z.infer<typeof point>;
export type DebriefResult = z.infer<typeof debriefResultSchema>;

/** Percentage of available marks, ignoring items that do not apply. */
export function overallScore(scores: RubricScores): number {
  const applicable = RUBRIC.map(r => scores[r.key]).filter(s => s !== null);
  if (applicable.length === 0) return 0;
  const total = applicable.reduce((sum, s) => sum + s.score, 0);
  return Math.round((total / (applicable.length * 2)) * 100);
}
