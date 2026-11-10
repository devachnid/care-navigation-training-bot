import { z } from 'zod';

export const hiddenFactSchema = z.object({
  /** Something true about the caller that they do not volunteer. */
  fact: z.string().min(1),
  /** The kind of question from the receptionist that brings it out. */
  unlockedBy: z.string().min(1),
});

export const scenarioSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  persona: z.object({
    name: z.string().min(1),
    age: z.number().int().min(16).max(110),
    description: z.string().min(1),
  }),
  openingLine: z.string().min(1),
  presentingStory: z.string().min(1),
  hiddenFacts: z.array(hiddenFactSchema).min(1),
  emotionalState: z.string().min(1),
  correctOutcome: z.string().min(1),
  acceptableAlternatives: z.array(z.string()),
  /** Empty array means the scenario has no red flag. */
  redFlags: z.array(z.string()),
  unsafeOutcomes: z.array(z.string()),
  clinicianApproved: z.boolean(),
  active: z.boolean(),
});

export type HiddenFact = z.infer<typeof hiddenFactSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
