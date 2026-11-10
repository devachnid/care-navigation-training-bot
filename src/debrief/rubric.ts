import { z } from 'zod';

/** The seven rubric items, each scored 0 to 2. Order is the order shown to the trainee. */
export const RUBRIC = [
  { key: 'greeting', label: 'Greeting and identification', guide: 'Gave their name; checked who is calling and for whom.' },
  {
    key: 'information',
    label: 'Information gathering',
    guide: 'Asked enough to navigate safely, including the questions that unlock hidden facts.',
  },
  { key: 'redFlag', label: 'Red flag recognition', guide: 'Spotted the red flag and acted on it. Not applicable if the scenario has none.' },
  { key: 'destination', label: 'Correct destination', guide: 'Matches the answer key or an acceptable alternative.' },
  { key: 'role', label: 'Stayed in role', guide: "No diagnosis or clinical advice beyond the receptionist's remit." },
  { key: 'explanation', label: 'Explanation', guide: 'Told the caller where they are going, why, and what to do if things get worse.' },
  { key: 'manner', label: 'Manner', guide: 'Empathy, clarity, handling of emotion or pushback.' },
] as const;

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

/** What the debrief model must return. */
export const debriefResultSchema = z.object({
  rubricScores: rubricScoresSchema,
  outcomeCorrect: z.boolean(),
  unsafeOutcome: z.boolean(),
  redFlagHandled: z.boolean().nullable().describe('null when the scenario has no red flag.'),
  strengths: z.array(point).min(2).max(3),
  improvements: z.array(point).min(2).max(3),
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
