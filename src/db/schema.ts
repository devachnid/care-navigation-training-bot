import { boolean, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { HiddenFact, Scenario } from '@/scenarios/types';
import type { RubricScores, QuotedPoint } from '@/debrief/rubric';

export const scenarios = pgTable('scenarios', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  difficulty: text('difficulty').$type<Scenario['difficulty']>().notNull(),
  persona: jsonb('persona').$type<Scenario['persona']>().notNull(),
  openingLine: text('opening_line').notNull(),
  presentingStory: text('presenting_story').notNull(),
  hiddenFacts: jsonb('hidden_facts').$type<HiddenFact[]>().notNull(),
  emotionalState: text('emotional_state').notNull(),
  correctOutcome: text('correct_outcome').notNull(),
  acceptableAlternatives: jsonb('acceptable_alternatives').$type<string[]>().notNull(),
  redFlags: jsonb('red_flags').$type<string[]>().notNull(),
  unsafeOutcomes: jsonb('unsafe_outcomes').$type<string[]>().notNull(),
  clinicianApproved: boolean('clinician_approved').notNull().default(false),
  active: boolean('active').notNull().default(true),
});

export type SessionStatus = 'created' | 'in_call' | 'debriefing' | 'complete' | 'too_short' | 'failed';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  traineeName: text('trainee_name').notNull(),
  scenarioId: text('scenario_id')
    .notNull()
    .references(() => scenarios.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  status: text('status').$type<SessionStatus>().notNull().default('created'),
});

export const transcriptTurns = pgTable(
  'transcript_turns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    speaker: text('speaker').$type<'trainee' | 'patient'>().notNull(),
    text: text('text').notNull(),
    sequence: integer('sequence').notNull(),
  },
  t => [unique('transcript_turns_session_sequence').on(t.sessionId, t.sequence)],
);

export const debriefs = pgTable('debriefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .unique()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  overallScore: integer('overall_score').notNull(),
  outcomeCorrect: boolean('outcome_correct').notNull(),
  unsafeOutcome: boolean('unsafe_outcome').notNull().default(false),
  redFlagHandled: boolean('red_flag_handled'),
  /** null when the call was too short to assess. */
  rubricScores: jsonb('rubric_scores').$type<RubricScores | null>(),
  strengths: jsonb('strengths').$type<QuotedPoint[]>().notNull(),
  improvements: jsonb('improvements').$type<QuotedPoint[]>().notNull(),
  quotedMoments: jsonb('quoted_moments').$type<string[]>().notNull(),
  modelUsed: text('model_used').notNull(),
});
