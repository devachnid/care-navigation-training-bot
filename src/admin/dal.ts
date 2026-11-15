import { and, eq, isNull, gt, desc, asc, sql } from 'drizzle-orm';
import { getDb, queryRows } from '@/db/client';
import { invitations, memberships, practices, users, type Role } from '@/db/schema';
import { audit } from '@/audit/log';
import type { Actor } from '@/policy/actor';
import { assertCan, fail, isUuid, type Result } from '@/policy/result';

/**
 * Platform-admin queries. These work across practices, so (unlike every other data-access file) a
 * practice id may come from the request. Every function starts by asserting `platform.admin`.
 *
 * They return names, states, people and usage counts only. Never a call's content: no transcripts,
 * debriefs, scores or scenario text, and nothing that says who made which call.
 *
 * "A call" is a session that was actually started (status other than `created`). Voice minutes are
 * the sum of `duration_seconds` / 60, rounded. Months are calendar months in Europe/London.
 */

const LONDON = 'Europe/London';
/** A started call: the call screen was opened and connected. */
const COUNTED = sql`s.status <> 'created'`;

const toDate = (v: unknown): Date | null => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v)));

export type ServiceSummary = {
  practices: number;
  suspendedPractices: number;
  activeStaff: number;
  /** Calls started this calendar month (Europe/London). */
  calls: number;
  voiceMinutes: number;
};

export async function getServiceSummary(actor: Actor, now: Date = new Date()): Promise<ServiceSummary> {
  assertCan(actor, 'platform.admin');
  const at = now.toISOString();
  const [row] = await queryRows<{ practices: number; suspended: number; staff: number; calls: number; minutes: number }>(sql`
    select
      (select count(*)::int from practices) as practices,
      (select count(*)::int from practices where suspended_at is not null) as suspended,
      (select count(distinct m.user_id)::int from memberships m join users u on u.id = m.user_id
         where m.deactivated_at is null and u.disabled_at is null) as staff,
      (select count(*)::int from sessions s
         where s.practice_id is not null and ${COUNTED}
           and s.started_at >= (date_trunc('month', ${at}::timestamptz at time zone ${LONDON}) at time zone ${LONDON})) as calls,
      (select coalesce(round(sum(s.duration_seconds) / 60.0), 0)::int from sessions s
         where s.practice_id is not null and ${COUNTED}
           and s.started_at >= (date_trunc('month', ${at}::timestamptz at time zone ${LONDON}) at time zone ${LONDON})) as minutes
  `);
  return { practices: row.practices, suspendedPractices: row.suspended, activeStaff: row.staff, calls: row.calls, voiceMinutes: row.minutes };
}

export type PracticeRow = {
  id: string;
  name: string;
  suspended: boolean;
  activeStaff: number;
  calls30: number;
  voiceMinutes30: number;
  lastCallAt: Date | null;
};

/** Every practice with its last-30-days usage, by name. */
export async function listPractices(actor: Actor, now: Date = new Date()): Promise<PracticeRow[]> {
  assertCan(actor, 'platform.admin');
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const rows = await queryRows<{
    id: string;
    name: string;
    suspended_at: unknown;
    staff: number;
    calls: number;
    minutes: number;
    last_call: unknown;
  }>(sql`
    select p.id, p.name, p.suspended_at,
      (select count(*)::int from memberships m join users u on u.id = m.user_id
         where m.practice_id = p.id and m.deactivated_at is null and u.disabled_at is null) as staff,
      (select count(*)::int from sessions s where s.practice_id = p.id and ${COUNTED} and s.started_at >= ${since}::timestamptz) as calls,
      (select coalesce(round(sum(s.duration_seconds) / 60.0), 0)::int from sessions s
         where s.practice_id = p.id and ${COUNTED} and s.started_at >= ${since}::timestamptz) as minutes,
      (select max(s.started_at) from sessions s where s.practice_id = p.id and ${COUNTED}) as last_call
    from practices p
    order by lower(p.name), p.created_at
  `);
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    suspended: r.suspended_at !== null,
    activeStaff: r.staff,
    calls30: r.calls,
    voiceMinutes30: r.minutes,
    lastCallAt: toDate(r.last_call),
  }));
}

export type PracticeDetail = { id: string; name: string; suspended: boolean; suspendedAt: Date | null; createdAt: Date };

/** One practice, or null when the id is malformed or unknown. */
export async function getPracticeDetail(actor: Actor, practiceId: string): Promise<PracticeDetail | null> {
  assertCan(actor, 'platform.admin');
  if (!isUuid(practiceId)) return null;
  const [p] = await getDb()
    .select({ id: practices.id, name: practices.name, suspendedAt: practices.suspendedAt, createdAt: practices.createdAt })
    .from(practices)
    .where(eq(practices.id, practiceId));
  return p ? { id: p.id, name: p.name, suspended: p.suspendedAt !== null, suspendedAt: p.suspendedAt, createdAt: p.createdAt } : null;
}

export type PracticePerson = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  canApproveScenarios: boolean;
  /** An active place in the practice and an account that is not disabled. */
  active: boolean;
  /** The account is disabled, so no reset link can be made for it. */
  disabled: boolean;
  lastSignInAt: Date | null;
};

/** Everyone who has a place in the practice: active first, then by name. */
export async function listPracticePeople(actor: Actor, practiceId: string): Promise<PracticePerson[]> {
  assertCan(actor, 'platform.admin');
  if (!isUuid(practiceId)) return [];
  const rows = await getDb()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      canApproveScenarios: memberships.canApproveScenarios,
      deactivatedAt: memberships.deactivatedAt,
      disabledAt: users.disabledAt,
      lastSignInAt: users.lastSignInAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.practiceId, practiceId))
    .orderBy(sql`(${memberships.deactivatedAt} is not null or ${users.disabledAt} is not null)`, asc(sql`lower(${users.name})`));
  return rows.map(r => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role,
    canApproveScenarios: r.canApproveScenarios,
    active: r.deactivatedAt === null && r.disabledAt === null,
    disabled: r.disabledAt !== null,
    lastSignInAt: r.lastSignInAt,
  }));
}

export type PendingManagerInvitation = { id: string; name: string; email: string; createdAt: Date; expiresAt: Date };

/** Manager invitations to this practice that can still be used. */
export async function listPendingManagerInvitations(
  actor: Actor,
  practiceId: string,
  now: Date = new Date(),
): Promise<PendingManagerInvitation[]> {
  assertCan(actor, 'platform.admin');
  if (!isUuid(practiceId)) return [];
  return getDb()
    .select({ id: invitations.id, name: invitations.name, email: invitations.email, createdAt: invitations.createdAt, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(
      and(
        eq(invitations.kind, 'invite'),
        eq(invitations.practiceId, practiceId),
        eq(invitations.role, 'manager'),
        isNull(invitations.usedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, now),
      ),
    )
    .orderBy(desc(invitations.createdAt));
}

/** Cancels an unused invitation to the given practice. The invitation must belong to that practice. */
export async function revokeManagerInvitation(actor: Actor, practiceId: string, invitationId: string): Promise<Result> {
  assertCan(actor, 'platform.admin');
  if (!isUuid(practiceId) || !isUuid(invitationId)) return fail('not_found', 'That invitation could not be found.');
  const [row] = await getDb()
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.kind, 'invite'),
        eq(invitations.practiceId, practiceId),
        isNull(invitations.usedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .returning({ id: invitations.id });
  if (!row) return fail('not_found', 'That invitation could not be found, or has already been used.');
  await audit(actor, 'invitation.revoked', { type: 'invitation', id: row.id, practiceId }, { kind: 'invite' });
  return { ok: true };
}

export type MonthUsage = { month: string; label: string; calls: number; voiceMinutes: number };

/** The last six calendar months (Europe/London), oldest first, this month last. Months with no calls show zero. */
export async function getPracticeUsageByMonth(actor: Actor, practiceId: string, now: Date = new Date()): Promise<MonthUsage[]> {
  assertCan(actor, 'platform.admin');
  if (!isUuid(practiceId)) return [];
  const at = now.toISOString();
  const rows = await queryRows<{ month: string; calls: number; minutes: number }>(sql`
    select to_char(m.month, 'YYYY-MM') as month,
           count(s.id)::int as calls,
           coalesce(round(sum(s.duration_seconds) / 60.0), 0)::int as minutes
    from generate_series(
           date_trunc('month', ${at}::timestamptz at time zone ${LONDON}) - interval '5 months',
           date_trunc('month', ${at}::timestamptz at time zone ${LONDON}),
           interval '1 month') as m(month)
    left join sessions s
      on s.practice_id = ${practiceId}::uuid
     and ${COUNTED}
     and (s.started_at at time zone ${LONDON}) >= m.month
     and (s.started_at at time zone ${LONDON}) < m.month + interval '1 month'
    group by m.month
    order by m.month
  `);
  const label = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return rows.map(r => ({ month: r.month, label: label.format(new Date(`${r.month}-01T00:00:00Z`)), calls: r.calls, voiceMinutes: r.minutes }));
}
