import { z } from 'zod';

/** The voices `openai/gpt-realtime-2.1` accepts (confirmed against the model, November 2026). */
export const VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] as const;

const line = (max: number) => z.string().trim().min(1).max(max);

export const hiddenFactSchema = z.object({
  /** Something true about the caller that they do not volunteer. */
  fact: line(1000),
  /** The kind of question from the receptionist that brings it out. */
  unlockedBy: line(1000),
});

/** What a scenario says: shared by library scenarios and practice scenarios. */
export const scenarioContentSchema = z.object({
  title: line(120),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  persona: z.object({
    name: line(80),
    age: z.number().int().min(16).max(110),
    description: line(2000),
  }),
  /** Which of the voice model's voices plays this caller. */
  voice: z.enum(VOICES),
  openingLine: line(500),
  presentingStory: line(4000),
  hiddenFacts: z.array(hiddenFactSchema).min(1).max(20),
  emotionalState: line(2000),
  correctOutcome: line(2000),
  acceptableAlternatives: z.array(line(1000)).max(20),
  /** Empty array means the scenario has no red flag. */
  redFlags: z.array(line(1000)).max(20),
  unsafeOutcomes: z.array(line(1000)).max(20),
});

/** A template in the shared library (`src/scenarios/seed.ts`). */
export const libraryScenarioSchema = scenarioContentSchema.extend({
  id: z.string().regex(/^[a-z0-9-]+$/),
  active: z.boolean(),
});

export type HiddenFact = z.infer<typeof hiddenFactSchema>;
export type ScenarioContent = z.infer<typeof scenarioContentSchema>;
export type LibraryScenario = z.infer<typeof libraryScenarioSchema>;

/**
 * What the caller and assessor prompts are built from: scenario content only.
 * Kept under this name because `src/patient/*` and `src/debrief/*` take it.
 */
export type Scenario = ScenarioContent;

/** The scenario as it was when a call started, stored on `sessions.scenario_snapshot`. */
export type ScenarioSnapshot = ScenarioContent & {
  practiceScenarioId: string;
  /** null for a scenario the practice wrote itself. */
  libraryScenarioId: string | null;
  revision: number;
  /** Whether this revision was approved when the call started. */
  approved: boolean;
};

/** The content fields, in a fixed order, for copying between rows. */
export const CONTENT_KEYS = [
  'title',
  'difficulty',
  'persona',
  'voice',
  'openingLine',
  'presentingStory',
  'hiddenFacts',
  'emotionalState',
  'correctOutcome',
  'acceptableAlternatives',
  'redFlags',
  'unsafeOutcomes',
] as const satisfies readonly (keyof ScenarioContent)[];

export function pickContent<T extends ScenarioContent>(row: T): ScenarioContent {
  const out = {} as Record<string, unknown>;
  for (const k of CONTENT_KEYS) out[k] = row[k];
  return out as ScenarioContent;
}
