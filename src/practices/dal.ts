import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { memberships, practices, practiceScenarios, scenarios, users, type Role } from '@/db/schema';
import { audit } from '@/audit/log';
import { setActivePractice } from '@/auth/sessions';
import type { Actor } from '@/policy/actor';
import { assertCan, assertMember, fail, isUuid, type Result } from '@/policy/result';
import { CONTENT_KEYS } from '@/scenarios/types';

// ---------------------------------------------------------------------------
// Practices (platform admin)
// ---------------------------------------------------------------------------

/** A tidied practice name, or null if it is not 2 to 120 characters. */
export const cleanPracticeName = (name: string): string | null => {
  const n = name.trim().replace(/\s+/g, ' ');
  return n.length >= 2 && n.length <= 120 ? n : null;
};

/**
 * Copies every active library scenario into a practice as a draft (revision 1, not approved).
 * One INSERT ... SELECT; already-copied scenarios are skipped. Not exported: the practice id must
 * never come from a request.
 */
async function copyActiveLibrary(practiceId: string): Promise<void> {
  const cols = CONTENT_KEYS.map(k => sql.identifier(practiceScenarios[k].name));
  const src = CONTENT_KEYS.map(k => sql`${scenarios}.${sql.identifier(scenarios[k].name)}`);
  await getDb().execute(sql`
    insert into ${practiceScenarios} (practice_id, library_scenario_id, revision, active, ${sql.join(cols, sql`, `)})
    select ${practiceId}::uuid, ${scenarios.id}, 1, true, ${sql.join(src, sql`, `)}
    from ${scenarios}
    where ${scenarios.active} = true
    on conflict (practice_id, library_scenario_id) do nothing
  `);
}

/** Platform admin: creates a practice with the active library copied in as drafts. Nobody is a member yet. */
export async function createPractice(actor: Actor, input: { name: string }): Promise<Result<{ practiceId: string }>> {
  assertCan(actor, 'platform.admin');
  const name = cleanPracticeName(input.name);
  if (!name) return fail('invalid', 'Enter the practice name (2 to 120 characters).');
  const [row] = await getDb().insert(practices).values({ name }).returning({ id: practices.id });
  await copyActiveLibrary(row.id);
  await audit(actor, 'practice.created', { type: 'practice', id: row.id, practiceId: row.id }, { name });
  return { ok: true, practiceId: row.id };
}

/** Platform admin: suspends or restores a practice. Its members lose practice access while suspended. */
export async function setPracticeSuspended(actor: Actor, practiceId: string, suspended: boolean): Promise<Result> {
  assertCan(actor, 'platform.admin');
  if (!isUuid(practiceId)) return fail('not_found', 'That practice could not be found.');
  const [row] = await getDb()
    .update(practices)
    .set({ suspendedAt: suspended ? new Date() : null })
    .where(eq(practices.id, practiceId))
    .returning({ id: practices.id });
  if (!row) return fail('not_found', 'That practice could not be found.');
  await audit(actor, suspended ? 'practice.suspended' : 'practice.restored', { type: 'practice', id: practiceId, practiceId });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings (manager)
// ---------------------------------------------------------------------------

export type PracticeSettings = {
  name: string;
  allowDraftScenarios: boolean;
  transcriptRetentionDays: number | null;
};

export async function getPracticeSettings(actor: Actor): Promise<PracticeSettings | null> {
  assertMember(actor, 'practice.settings');
  const [row] = await getDb()
    .select({
      name: practices.name,
      allowDraftScenarios: practices.allowDraftScenarios,
      transcriptRetentionDays: practices.transcriptRetentionDays,
    })
    .from(practices)
    .where(eq(practices.id, actor.membership.practiceId));
  return row ?? null;
}

export async function updatePracticeSettings(actor: Actor, input: Partial<PracticeSettings>): Promise<Result> {
  assertMember(actor, 'practice.settings');
  const set: Partial<PracticeSettings> = {};
  if (input.name !== undefined) {
    const name = cleanPracticeName(input.name);
    if (!name) return fail('invalid', 'Enter the practice name (2 to 120 characters).');
    set.name = name;
  }
  if (input.allowDraftScenarios !== undefined) set.allowDraftScenarios = input.allowDraftScenarios === true;
  if (input.transcriptRetentionDays !== undefined) {
    const d = input.transcriptRetentionDays;
    if (d !== null && (!Number.isInteger(d) || d < 7 || d > 3650)) {
      return fail('invalid', 'Keep transcripts for between 7 and 3650 days, or choose to keep them.');
    }
    set.transcriptRetentionDays = d;
  }
  if (Object.keys(set).length === 0) return { ok: true };
  await getDb().update(practices).set(set).where(eq(practices.id, actor.membership.practiceId));
  await audit(actor, 'practice.settings_changed', { type: 'practice', id: actor.membership.practiceId }, set);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Team (manager)
// ---------------------------------------------------------------------------

export type Member = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  canApproveScenarios: boolean;
  joinedAt: Date;
  deactivatedAt: Date | null;
  lastSignInAt: Date | null;
  /** The account is disabled platform-wide. */
  accountDisabled: boolean;
};

const memberFields = {
  userId: users.id,
  name: users.name,
  email: users.email,
  role: memberships.role,
  canApproveScenarios: memberships.canApproveScenarios,
  joinedAt: memberships.createdAt,
  deactivatedAt: memberships.deactivatedAt,
  lastSignInAt: users.lastSignInAt,
  disabledAt: users.disabledAt,
};

const toMember = ({ disabledAt, ...m }: { disabledAt: Date | null } & Omit<Member, 'accountDisabled'>): Member => ({
  ...m,
  accountDisabled: disabledAt !== null,
});

/** Everyone in the actor's practice, active first, then by name. */
export async function listMembers(actor: Actor): Promise<Member[]> {
  assertMember(actor, 'team.manage');
  const rows = await getDb()
    .select(memberFields)
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.practiceId, actor.membership.practiceId))
    .orderBy(sql`${memberships.deactivatedAt} is not null`, asc(users.name));
  return rows.map(toMember);
}

/** One member of the actor's practice, or null (including for someone in another practice). */
export async function getMember(actor: Actor, userId: string): Promise<Member | null> {
  assertMember(actor, 'team.manage');
  if (!isUuid(userId)) return null;
  const [row] = await getDb()
    .select(memberFields)
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.practiceId, actor.membership.practiceId), eq(memberships.userId, userId)));
  return row ? toMember(row) : null;
}

const NOT_A_MEMBER = 'That person is not in your practice.';
const NOT_YOURSELF = 'You cannot change this for yourself. Ask another manager in your practice.';
const LAST_MANAGER =
  'Your practice must always have at least one active manager. Make someone else a manager first.';

/**
 * SQL that is true when the practice has another active manager besides `userId`, whose account
 * is not disabled. `FOR UPDATE` locks those rows, so two managers demoting each other at the same
 * moment cannot both succeed (one waits, then sees the other is no longer a manager, or Postgres
 * aborts one as a deadlock).
 */
function anotherActiveManager(practiceId: string, userId: string) {
  return sql`exists (
    select 1 from ${memberships} o
    join ${users} u on u.id = o.user_id and u.disabled_at is null
    where o.practice_id = ${practiceId} and o.user_id <> ${userId}
      and o.role = 'manager' and o.deactivated_at is null
    for update of o
  )`;
}

/** Tells apart "no such member" from "refused by the guard" after an UPDATE matched nothing. */
async function failFor(practiceId: string, userId: string): Promise<Result> {
  const [m] = await getDb()
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.practiceId, practiceId), eq(memberships.userId, userId)));
  return m ? fail('conflict', LAST_MANAGER) : fail('not_found', NOT_A_MEMBER);
}

export async function changeMemberRole(actor: Actor, userId: string, role: Role): Promise<Result> {
  assertMember(actor, 'team.manage');
  if (role !== 'manager' && role !== 'trainee') return fail('invalid', 'Choose trainee or manager.');
  if (!isUuid(userId)) return fail('not_found', NOT_A_MEMBER);
  if (userId === actor.userId) return fail('conflict', NOT_YOURSELF);
  const practiceId = actor.membership.practiceId;
  const guard =
    role === 'manager'
      ? undefined
      : sql`(${memberships.role} <> 'manager' or ${memberships.deactivatedAt} is not null or ${anotherActiveManager(practiceId, userId)})`;
  const [row] = await getDb()
    .update(memberships)
    .set({ role })
    .where(and(eq(memberships.practiceId, practiceId), eq(memberships.userId, userId), guard))
    .returning({ id: memberships.id });
  if (!row) return failFor(practiceId, userId);
  await audit(actor, 'member.role_changed', { type: 'user', id: userId }, { role });
  return { ok: true };
}

export async function setMemberApprover(actor: Actor, userId: string, canApproveScenarios: boolean): Promise<Result> {
  assertMember(actor, 'team.manage');
  if (!isUuid(userId)) return fail('not_found', NOT_A_MEMBER);
  // A manager may not make themselves a clinician approver: approval must come from someone else.
  if (userId === actor.userId) return fail('conflict', NOT_YOURSELF);
  const [row] = await getDb()
    .update(memberships)
    .set({ canApproveScenarios: canApproveScenarios === true })
    .where(and(eq(memberships.practiceId, actor.membership.practiceId), eq(memberships.userId, userId)))
    .returning({ id: memberships.id });
  if (!row) return fail('not_found', NOT_A_MEMBER);
  await audit(actor, 'member.approver_changed', { type: 'user', id: userId }, { canApproveScenarios });
  return { ok: true };
}

export async function deactivateMember(actor: Actor, userId: string): Promise<Result> {
  assertMember(actor, 'team.manage');
  if (!isUuid(userId)) return fail('not_found', NOT_A_MEMBER);
  if (userId === actor.userId) return fail('conflict', NOT_YOURSELF);
  const practiceId = actor.membership.practiceId;
  const [row] = await getDb()
    .update(memberships)
    .set({ deactivatedAt: new Date() })
    .where(
      and(
        eq(memberships.practiceId, practiceId),
        eq(memberships.userId, userId),
        isNull(memberships.deactivatedAt),
        sql`(${memberships.role} <> 'manager' or ${anotherActiveManager(practiceId, userId)})`,
      ),
    )
    .returning({ id: memberships.id });
  if (!row) {
    const [already] = await getDb()
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.practiceId, practiceId), eq(memberships.userId, userId), isNotNull(memberships.deactivatedAt)));
    if (already) return { ok: true };
    return failFor(practiceId, userId);
  }
  await audit(actor, 'member.deactivated', { type: 'user', id: userId });
  return { ok: true };
}

export async function reactivateMember(actor: Actor, userId: string): Promise<Result> {
  assertMember(actor, 'team.manage');
  if (!isUuid(userId)) return fail('not_found', NOT_A_MEMBER);
  if (userId === actor.userId) return fail('conflict', NOT_YOURSELF);
  const [row] = await getDb()
    .update(memberships)
    .set({ deactivatedAt: null })
    .where(and(eq(memberships.practiceId, actor.membership.practiceId), eq(memberships.userId, userId)))
    .returning({ id: memberships.id });
  if (!row) return fail('not_found', NOT_A_MEMBER);
  await audit(actor, 'member.reactivated', { type: 'user', id: userId });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The signed-in user's own practices
// ---------------------------------------------------------------------------

export type MyPractice = { practiceId: string; practiceName: string; role: Role; current: boolean };

/** Practices the actor can act in: active memberships of unsuspended practices. */
export async function listMyPractices(actor: Actor): Promise<MyPractice[]> {
  const rows = await getDb()
    .select({ practiceId: practices.id, practiceName: practices.name, role: memberships.role })
    .from(memberships)
    .innerJoin(practices, eq(practices.id, memberships.practiceId))
    .where(and(eq(memberships.userId, actor.userId), isNull(memberships.deactivatedAt), isNull(practices.suspendedAt)))
    .orderBy(asc(practices.name));
  return rows.map(r => ({ ...r, current: r.practiceId === actor.membership?.practiceId }));
}

/**
 * Switches the session behind `sessionToken` to another of the actor's own practices. The id is
 * checked against the actor's memberships, so it cannot reach a practice they are not in.
 */
export async function switchPractice(actor: Actor, sessionToken: string, practiceId: string): Promise<Result> {
  if (!isUuid(practiceId) || !(await setActivePractice(sessionToken, actor.userId, practiceId))) {
    return fail('not_found', 'You are not a member of that practice.');
  }
  return { ok: true };
}
