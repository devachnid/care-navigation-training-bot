import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { HiddenFact, ScenarioContent, ScenarioSnapshot } from '@/scenarios/types';
import type { RubricScores, QuotedPoint } from '@/debrief/rubric';

const tz = (name: string) => timestamp(name, { withTimezone: true });

export type Role = 'trainee' | 'manager';
export type InvitationKind = 'invite' | 'reset';

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Always stored trimmed and lower-cased (see `normaliseEmail`). */
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    /** null until the person sets a password. */
    passwordHash: text('password_hash'),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    privacyAckAt: tz('privacy_ack_at'),
    createdAt: tz('created_at').notNull().defaultNow(),
    lastSignInAt: tz('last_sign_in_at'),
    disabledAt: tz('disabled_at'),
  },
  t => [check('users_email_normalised', sql`${t.email} = lower(btrim(${t.email}))`)],
);

export const practices = pgTable('practices', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: tz('created_at').notNull().defaultNow(),
  suspendedAt: tz('suspended_at'),
  allowDraftScenarios: boolean('allow_draft_scenarios').notNull().default(false),
  /** null means transcripts are kept. */
  transcriptRetentionDays: integer('transcript_retention_days'),
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** SHA-256 (hex) of the cookie token. The token itself is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activePracticeId: uuid('active_practice_id').references(() => practices.id, { onDelete: 'set null' }),
    createdAt: tz('created_at').notNull().defaultNow(),
    expiresAt: tz('expires_at').notNull(),
  },
  t => [index('auth_sessions_user_id').on(t.userId)],
);

export const authThrottle = pgTable('auth_throttle', {
  /** e.g. `email:a@b.c` or `ip:1.2.3.4`. */
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStartedAt: tz('window_started_at').notNull(),
});

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<InvitationKind>().notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    /** The practice joined (invite) or the practice whose manager made the link (reset; null when a platform admin made it). */
    practiceId: uuid('practice_id').references(() => practices.id),
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** null for a reset. */
    role: text('role').$type<Role>(),
    canApproveScenarios: boolean('can_approve_scenarios').notNull().default(false),
    /** The account a reset is for; null for an invite. */
    userId: uuid('user_id').references(() => users.id),
    /** null only for links made from the command line. */
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: tz('created_at').notNull().defaultNow(),
    expiresAt: tz('expires_at').notNull(),
    usedAt: tz('used_at'),
    revokedAt: tz('revoked_at'),
  },
  t => [
    check('invitations_kind', sql`${t.kind} in ('invite', 'reset')`),
    check(
      'invitations_shape',
      sql`(${t.kind} = 'invite' and ${t.practiceId} is not null and ${t.role} is not null and ${t.userId} is null)
        or (${t.kind} = 'reset' and ${t.role} is null and ${t.userId} is not null)`,
    ),
    index('invitations_practice_id').on(t.practiceId),
  ],
);

// ---------------------------------------------------------------------------
// Practices
// ---------------------------------------------------------------------------

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practices.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').$type<Role>().notNull(),
    canApproveScenarios: boolean('can_approve_scenarios').notNull().default(false),
    createdAt: tz('created_at').notNull().defaultNow(),
    deactivatedAt: tz('deactivated_at'),
  },
  t => [
    unique('memberships_practice_user').on(t.practiceId, t.userId),
    index('memberships_user_id').on(t.userId),
    check('memberships_role', sql`${t.role} in ('trainee', 'manager')`),
  ],
);

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/** Content columns shared by library and practice scenarios. A function so each table gets its own builders. */
function contentColumns() {
  return {
    title: text('title').notNull(),
    difficulty: text('difficulty').$type<ScenarioContent['difficulty']>().notNull(),
    persona: jsonb('persona').$type<ScenarioContent['persona']>().notNull(),
    voice: text('voice').$type<ScenarioContent['voice']>().notNull().default('ballad'),
    openingLine: text('opening_line').notNull(),
    presentingStory: text('presenting_story').notNull(),
    hiddenFacts: jsonb('hidden_facts').$type<HiddenFact[]>().notNull(),
    emotionalState: text('emotional_state').notNull(),
    correctOutcome: text('correct_outcome').notNull(),
    acceptableAlternatives: jsonb('acceptable_alternatives').$type<string[]>().notNull(),
    redFlags: jsonb('red_flags').$type<string[]>().notNull(),
    unsafeOutcomes: jsonb('unsafe_outcomes').$type<string[]>().notNull(),
  };
}

/** The shared library, synced from `src/scenarios/seed.ts`. */
export const scenarios = pgTable('scenarios', {
  id: text('id').primaryKey(),
  ...contentColumns(),
  active: boolean('active').notNull().default(true),
});

/** What a practice's staff actually call. Approved when `approved_revision = revision`. */
export const practiceScenarios = pgTable(
  'practice_scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practices.id),
    libraryScenarioId: text('library_scenario_id').references(() => scenarios.id),
    revision: integer('revision').notNull().default(1),
    ...contentColumns(),
    active: boolean('active').notNull().default(true),
    approvedRevision: integer('approved_revision'),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: tz('approved_at'),
    createdAt: tz('created_at').notNull().defaultNow(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  t => [unique('practice_scenarios_practice_library').on(t.practiceId, t.libraryScenarioId)],
);

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export type SessionStatus = 'created' | 'in_call' | 'debriefing' | 'complete' | 'too_short' | 'failed';

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Legacy (PoC rows only). */
    traineeName: text('trainee_name'),
    /** Legacy (PoC rows only). */
    scenarioId: text('scenario_id').references(() => scenarios.id),
    practiceId: uuid('practice_id').references(() => practices.id),
    userId: uuid('user_id').references(() => users.id),
    practiceScenarioId: uuid('practice_scenario_id').references(() => practiceScenarios.id),
    /** The scenario as it was when the call started. The debrief judges against this. */
    scenarioSnapshot: jsonb('scenario_snapshot').$type<ScenarioSnapshot>(),
    startedAt: tz('started_at').notNull().defaultNow(),
    endedAt: tz('ended_at'),
    durationSeconds: integer('duration_seconds'),
    status: text('status').$type<SessionStatus>().notNull().default('created'),
    /** Voice tokens minted for this call (at most 3). */
    tokenMints: integer('token_mints').notNull().default(0),
    /** Debrief runs started: the automatic one counts as 1; at most 2 retries after that. */
    debriefAttempts: integer('debrief_attempts').notNull().default(0),
  },
  t => [
    index('sessions_practice_started').on(t.practiceId, t.startedAt),
    index('sessions_user_started').on(t.userId, t.startedAt),
  ],
);

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
  /** Which assessor prompt produced this; null for PoC rows and calls too short to assess. */
  promptVersion: text('prompt_version'),
});

export const debriefFlags = pgTable('debrief_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  practiceId: uuid('practice_id')
    .notNull()
    .references(() => practices.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  reason: text('reason').notNull(),
  createdAt: tz('created_at').notNull().defaultNow(),
  resolvedAt: tz('resolved_at'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** Append-only. No foreign keys, so entries outlive whatever they describe. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: tz('at').notNull().defaultNow(),
    actorUserId: uuid('actor_user_id'),
    practiceId: uuid('practice_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
  },
  t => [index('audit_log_practice_at').on(t.practiceId, t.at)],
);
