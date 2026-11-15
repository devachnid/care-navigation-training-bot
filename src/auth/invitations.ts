import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { getDb, queryRows } from '@/db/client';
import { invitations, memberships, practices, users, type Role } from '@/db/schema';
import { audit, type AuditActor } from '@/audit/log';
import type { Actor } from '@/policy/actor';
import { assertCan, assertMember, fail, isUuid, type Result } from '@/policy/result';
import { cleanName, isPlausibleEmail, normaliseEmail } from './email';
import { checkPasswordPolicy, hashPassword } from './password';
import { createSession, deleteUserSessions, type NewSession } from './sessions';
import { hashToken, isWellFormedToken, newToken } from './tokens';

export const INVITE_DAYS = 7;
export const RESET_HOURS = 24;

/** Shown once to whoever made it; only the hash is stored. The page links to `/invite/<token>`. */
export type InvitationLink = { invitationId: string; token: string; expiresAt: Date };

export type InviteOutcome =
  | { added: true; userId: string }
  | ({ added: false } & InvitationLink);

export type InviteInput = { email: string; name: string; role: Role; canApproveScenarios: boolean };

const LINK_UNUSABLE = 'This link has expired, been used already or been cancelled. Ask your practice manager for a new one.';

// ---------------------------------------------------------------------------
// Creating invitations
// ---------------------------------------------------------------------------

/**
 * Adds someone to a practice. If the email already has an account the membership is added
 * straight away; otherwise an invitation link is made (7 days). Any earlier unused invitation for
 * the same email and practice is cancelled.
 */
async function inviteInto(practiceId: string, by: AuditActor, input: InviteInput): Promise<Result<InviteOutcome>> {
  const email = normaliseEmail(input.email);
  const name = cleanName(input.name);
  if (!isPlausibleEmail(email)) return fail('invalid', 'Enter their email address, like name@example.com.');
  if (!name) return fail('invalid', 'Enter their name (up to 80 characters).');
  if (input.role !== 'trainee' && input.role !== 'manager') return fail('invalid', 'Choose trainee or manager.');
  const canApproveScenarios = input.canApproveScenarios === true;
  const db = getDb();

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) {
    const [added] = await db
      .insert(memberships)
      .values({ practiceId, userId: existing.id, role: input.role, canApproveScenarios })
      .onConflictDoNothing({ target: [memberships.practiceId, memberships.userId] })
      .returning({ id: memberships.id });
    if (!added) {
      return fail(
        'conflict',
        'That person is already in your practice. If they have been deactivated, reactivate them from the team page.',
      );
    }
    await audit(by, 'member.added', { type: 'user', id: existing.id, practiceId }, { role: input.role, canApproveScenarios });
    return { ok: true, added: true, userId: existing.id };
  }

  const now = new Date();
  await db
    .update(invitations)
    .set({ revokedAt: now })
    .where(
      and(
        eq(invitations.kind, 'invite'),
        eq(invitations.practiceId, practiceId),
        eq(invitations.email, email),
        isNull(invitations.usedAt),
        isNull(invitations.revokedAt),
      ),
    );
  const token = newToken();
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86_400_000);
  const [row] = await db
    .insert(invitations)
    .values({
      kind: 'invite',
      tokenHash: hashToken(token),
      practiceId,
      email,
      name,
      role: input.role,
      canApproveScenarios,
      createdBy: by.userId,
      createdAt: now,
      expiresAt,
    })
    .returning({ id: invitations.id });
  await audit(by, 'member.invited', { type: 'invitation', id: row.id, practiceId }, { email, role: input.role, canApproveScenarios });
  return { ok: true, added: false, invitationId: row.id, token, expiresAt };
}

/** Manager: invites someone to the manager's own practice. */
export async function createInvitation(actor: Actor, input: InviteInput): Promise<Result<InviteOutcome>> {
  assertMember(actor, 'team.manage');
  return inviteInto(actor.membership.practiceId, actor, input);
}

/**
 * Platform admin: invites a practice's manager (typically its first). This is a platform-level
 * action, so it is the one place a practice id comes from the caller; it requires `platform.admin`.
 */
export async function createManagerInvitation(
  actor: Actor,
  practiceId: string,
  input: { email: string; name: string },
): Promise<Result<InviteOutcome>> {
  assertCan(actor, 'platform.admin');
  if (!isUuid(practiceId)) return fail('not_found', 'That practice could not be found.');
  const [p] = await getDb().select({ id: practices.id }).from(practices).where(eq(practices.id, practiceId));
  if (!p) return fail('not_found', 'That practice could not be found.');
  return inviteInto(practiceId, actor, { ...input, role: 'manager', canApproveScenarios: false });
}

export type PendingInvitation = {
  id: string;
  kind: 'invite' | 'reset';
  email: string;
  name: string;
  role: Role | null;
  canApproveScenarios: boolean;
  createdAt: Date;
  expiresAt: Date;
};

/** Manager: invitations and reset links made in this practice that can still be used. */
export async function listPendingInvitations(actor: Actor): Promise<PendingInvitation[]> {
  assertMember(actor, 'team.manage');
  return getDb()
    .select({
      id: invitations.id,
      kind: invitations.kind,
      email: invitations.email,
      name: invitations.name,
      role: invitations.role,
      canApproveScenarios: invitations.canApproveScenarios,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.practiceId, actor.membership.practiceId),
        isNull(invitations.usedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invitations.createdAt));
}

/** Manager: cancels an unused invitation or reset link made in this practice. */
export async function revokeInvitation(actor: Actor, invitationId: string): Promise<Result> {
  assertMember(actor, 'team.manage');
  if (!isUuid(invitationId)) return fail('not_found', 'That invitation could not be found.');
  const [row] = await getDb()
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.practiceId, actor.membership.practiceId),
        isNull(invitations.usedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .returning({ id: invitations.id, kind: invitations.kind });
  if (!row) return fail('not_found', 'That invitation could not be found, or has already been used.');
  await audit(actor, 'invitation.revoked', { type: 'invitation', id: row.id }, { kind: row.kind });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reset links
// ---------------------------------------------------------------------------

/**
 * SQL: true when a manager of `practiceId` may reset `userId`'s password. The user must be an
 * active member of that practice, not a platform admin, not disabled, and have no active
 * membership of any other practice: otherwise a reset link would be a way into another practice
 * or the platform, and only a platform admin may make it.
 */
function managerMayReset(practiceId: string, userId: string) {
  return sql`exists (
      select 1 from ${users} u
      join ${memberships} m on m.user_id = u.id and m.practice_id = ${practiceId} and m.deactivated_at is null
      where u.id = ${userId} and u.is_platform_admin = false and u.disabled_at is null
    )
    and not exists (
      select 1 from ${memberships} o
      where o.user_id = ${userId} and o.practice_id <> ${practiceId} and o.deactivated_at is null
    )`;
}

async function makeResetLink(
  user: { id: string; email: string; name: string },
  practiceId: string | null,
  by: AuditActor | null,
): Promise<InvitationLink> {
  const db = getDb();
  const now = new Date();
  // Only the newest reset link for an account works.
  await db
    .update(invitations)
    .set({ revokedAt: now })
    .where(and(eq(invitations.kind, 'reset'), eq(invitations.userId, user.id), isNull(invitations.usedAt), isNull(invitations.revokedAt)));
  const token = newToken();
  const expiresAt = new Date(now.getTime() + RESET_HOURS * 3600_000);
  const [row] = await db
    .insert(invitations)
    .values({
      kind: 'reset',
      tokenHash: hashToken(token),
      practiceId,
      email: user.email,
      name: user.name,
      userId: user.id,
      createdBy: by?.userId ?? null,
      createdAt: now,
      expiresAt,
    })
    .returning({ id: invitations.id });
  await audit(by, 'reset_link.created', { type: 'user', id: user.id, practiceId }, { invitationId: row.id });
  return { invitationId: row.id, token, expiresAt };
}

/** Manager: a 24-hour password reset link for a member of their practice, within the rule above. */
export async function createResetLink(actor: Actor, userId: string): Promise<Result<InvitationLink>> {
  assertMember(actor, 'team.manage');
  if (!isUuid(userId)) return fail('not_found', 'That person is not in your practice.');
  const practiceId = actor.membership.practiceId;
  const [target] = await getDb()
    .select({ id: users.id, email: users.email, name: users.name, allowed: sql<boolean>`${managerMayReset(practiceId, userId)}` })
    .from(users)
    .innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.practiceId, practiceId)))
    .where(eq(users.id, userId));
  if (!target) return fail('not_found', 'That person is not in your practice.');
  if (!target.allowed) {
    return fail(
      'conflict',
      'You cannot make a reset link for this person, because their account is also used outside your practice (or is deactivated). Ask the platform administrator to do it.',
    );
  }
  return { ok: true, ...(await makeResetLink(target, practiceId, actor)) };
}

/** Platform admin: a reset link for any account that is not disabled. */
export async function createResetLinkAsPlatformAdmin(actor: Actor, userId: string): Promise<Result<InvitationLink>> {
  assertCan(actor, 'platform.admin');
  if (!isUuid(userId)) return fail('not_found', 'That account could not be found.');
  const [target] = await getDb()
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.disabledAt)));
  if (!target) return fail('not_found', 'That account could not be found, or is disabled.');
  return { ok: true, ...(await makeResetLink(target, null, actor)) };
}

/**
 * For `npm run admin:reset-link` only (someone with database access, e.g. a locked-out platform
 * admin). Refuses to run inside the Next server, so no page or action can reach it.
 */
export async function createResetLinkFromCommandLine(email: string): Promise<Result<InvitationLink>> {
  if (process.env.NEXT_RUNTIME) throw new Error('createResetLinkFromCommandLine is for the command line only');
  const [target] = await getDb()
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.email, normaliseEmail(email)), isNull(users.disabledAt)));
  if (!target) return fail('not_found', `No account that is not disabled has the email ${normaliseEmail(email)}.`);
  return { ok: true, ...(await makeResetLink(target, null, null)) };
}

// ---------------------------------------------------------------------------
// Using a link
// ---------------------------------------------------------------------------

export type InvitationDetails = {
  kind: 'invite' | 'reset';
  email: string;
  name: string;
  /** The practice being joined (invite), or null (reset). */
  practiceName: string | null;
  expiresAt: Date;
  /** The person must tick the privacy notice: always for an invite, for a reset only if never accepted. */
  needsPrivacyAck: boolean;
};

const usable = (now: Date) => and(isNull(invitations.usedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, now));

/** What `/invite/<token>` shows, or null if the link cannot be used. Changes nothing. */
export async function lookupInvitation(token: string): Promise<InvitationDetails | null> {
  if (!isWellFormedToken(token)) return null;
  const now = new Date();
  const [row] = await getDb()
    .select({
      kind: invitations.kind,
      email: invitations.email,
      name: invitations.name,
      expiresAt: invitations.expiresAt,
      practiceName: practices.name,
      privacyAckAt: users.privacyAckAt,
    })
    .from(invitations)
    .leftJoin(practices, eq(practices.id, invitations.practiceId))
    .leftJoin(users, eq(users.id, invitations.userId))
    .where(and(eq(invitations.tokenHash, hashToken(token)), usable(now)));
  if (!row) return null;
  return {
    kind: row.kind,
    email: row.email,
    name: row.name,
    practiceName: row.kind === 'invite' ? row.practiceName : null,
    expiresAt: row.expiresAt,
    needsPrivacyAck: row.kind === 'invite' || row.privacyAckAt === null,
  };
}

/**
 * Accepts an invitation (creates the account and membership) or uses a reset link (sets the
 * password and signs out every other session), then starts a session.
 *
 * The link is claimed with one `UPDATE ... WHERE used_at IS NULL ... RETURNING`, so it works once
 * even if two requests race. Everything is checked before the claim; if a later step fails the
 * link is spent and a new one is needed, which leaves nothing unsafe behind.
 */
export async function acceptInvitation(input: {
  token: string;
  password: string;
  privacyAccepted: boolean;
}): Promise<Result<NewSession>> {
  if (!isWellFormedToken(input.token)) return fail('not_found', LINK_UNUSABLE);
  const db = getDb();
  const tokenHash = hashToken(input.token);
  const now = new Date();

  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.tokenHash, tokenHash), usable(now)));
  if (!inv) return fail('not_found', LINK_UNUSABLE);

  const problem = checkPasswordPolicy(input.password, inv.email);
  if (problem) return fail('invalid', problem);

  const [account] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, privacyAckAt: users.privacyAckAt, disabledAt: users.disabledAt })
    .from(users)
    .where(inv.kind === 'reset' && inv.userId ? eq(users.id, inv.userId) : eq(users.email, inv.email));

  const needsPrivacyAck = inv.kind === 'invite' || !account?.privacyAckAt;
  if (needsPrivacyAck && input.privacyAccepted !== true) {
    return fail('invalid', 'Read the privacy notice and tick the box to say you have read it.');
  }

  if (inv.kind === 'invite' && account?.passwordHash) {
    return fail('conflict', 'There is already an account for this email. Sign in with it, and ask your manager to add you to the practice.');
  }
  if (inv.kind === 'reset') {
    if (!account || account.disabledAt) return fail('not_found', LINK_UNUSABLE);
    if (inv.practiceId) {
      // Made by a manager: the cross-practice rule must still hold now, not just when the link was made.
      const [check] = await queryRows<{ allowed: boolean }>(sql`select (${managerMayReset(inv.practiceId, account.id)}) as allowed`);
      if (check?.allowed !== true) return fail('conflict', 'This link can no longer be used. Ask the platform administrator for a new one.');
    }
  }

  const passwordHash = await hashPassword(input.password);

  // The claim. From here on the link is spent.
  const [claimed] = await db
    .update(invitations)
    .set({ usedAt: now })
    .where(and(eq(invitations.id, inv.id), usable(now)))
    .returning({ id: invitations.id });
  if (!claimed) return fail('not_found', LINK_UNUSABLE);

  if (inv.kind === 'reset') {
    const userId = inv.userId!;
    await db
      .update(users)
      .set({ passwordHash, ...(input.privacyAccepted === true && needsPrivacyAck ? { privacyAckAt: now } : {}) })
      .where(eq(users.id, userId));
    await deleteUserSessions(userId);
    await audit({ userId }, 'password.reset', { type: 'user', id: userId, practiceId: inv.practiceId }, { invitationId: inv.id });
    const [m] = await db
      .select({ practiceId: memberships.practiceId })
      .from(memberships)
      .innerJoin(practices, eq(practices.id, memberships.practiceId))
      .where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt), isNull(practices.suspendedAt)))
      .orderBy(memberships.createdAt)
      .limit(1);
    return { ok: true, ...(await createSession(userId, m?.practiceId ?? null)) };
  }

  // Invite: create the account, or give a password to an account that has none yet.
  const practiceId = inv.practiceId!;
  let userId: string;
  const [created] = await db
    .insert(users)
    .values({ email: inv.email, name: inv.name, passwordHash, privacyAckAt: now })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (created) {
    userId = created.id;
  } else {
    const [updated] = await db
      .update(users)
      .set({ passwordHash, privacyAckAt: now })
      .where(and(eq(users.email, inv.email), isNull(users.passwordHash)))
      .returning({ id: users.id });
    if (!updated) {
      // Someone set up this account between our check and the claim: do not touch its password.
      return fail('conflict', 'There is already an account for this email. Sign in with it, and ask your manager to add you to the practice.');
    }
    userId = updated.id;
  }

  await db
    .insert(memberships)
    .values({ practiceId, userId, role: inv.role!, canApproveScenarios: inv.canApproveScenarios })
    .onConflictDoUpdate({
      target: [memberships.practiceId, memberships.userId],
      set: { role: inv.role!, canApproveScenarios: inv.canApproveScenarios, deactivatedAt: null },
    });
  await audit({ userId }, 'invitation.accepted', { type: 'invitation', id: inv.id, practiceId }, { role: inv.role });
  return { ok: true, ...(await createSession(userId, practiceId)) };
}
