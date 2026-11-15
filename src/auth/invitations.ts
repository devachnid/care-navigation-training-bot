import { and, desc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDb, queryRows } from '@/db/client';
import { invitations, memberships, practices, users, type Role } from '@/db/schema';
import { audit, type AuditActor } from '@/audit/log';
import type { Actor } from '@/policy/actor';
import { assertCan, assertMember, fail, isUuid, type Result } from '@/policy/result';
import { cleanName, isPlausibleEmail, normaliseEmail } from './email';
import { checkPasswordPolicy, hashPassword } from './password';
import { createSession, defaultPracticeFor, deleteUserSessions, type NewSession } from './sessions';
import { checkCredentials } from './sign-in';
import { hashToken, isWellFormedToken, newToken } from './tokens';

export const INVITE_DAYS = 7;
export const RESET_HOURS = 24;

/** Shown once to whoever made it; only the hash is stored. The page links to `/invite/<token>`. */
export type InvitationLink = { invitationId: string; token: string; expiresAt: Date };

export type InviteInput = { email: string; name: string; role: Role; canApproveScenarios: boolean };

const LINK_UNUSABLE = 'This link has expired, been used already or been cancelled. Ask whoever sent you the link for a new one.';

// ---------------------------------------------------------------------------
// Creating invitations
// ---------------------------------------------------------------------------

/**
 * Makes an invitation link (7 days) to join a practice. Always a link, never an immediate
 * membership, even when the email already has an account: joining must be done by whoever holds
 * that account (they confirm with their current password), and the answer must not reveal whether
 * the email has an account anywhere. Any earlier unused invitation for the same email and
 * practice is cancelled. Refused only when the email is already a member of this practice.
 */
async function inviteInto(practiceId: string, by: AuditActor, input: InviteInput): Promise<Result<InvitationLink>> {
  const email = normaliseEmail(input.email);
  const name = cleanName(input.name);
  if (!isPlausibleEmail(email)) return fail('invalid', 'Enter their email address, like name@example.com.');
  if (!name) return fail('invalid', 'Enter their name (up to 80 characters).');
  if (input.role !== 'trainee' && input.role !== 'manager') return fail('invalid', 'Choose trainee or manager.');
  const canApproveScenarios = input.canApproveScenarios === true;
  const db = getDb();

  // Only this practice's own membership list is consulted, so nothing about other practices leaks.
  const [member] = await db
    .select({ deactivatedAt: memberships.deactivatedAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.practiceId, practiceId), eq(users.email, email)));
  if (member) {
    return fail(
      'conflict',
      member.deactivatedAt
        ? 'That person is already in your practice but deactivated. Reactivate them from the team page.'
        : 'That person is already in your practice.',
    );
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
  return { ok: true, invitationId: row.id, token, expiresAt };
}

/** Manager: invites someone to the manager's own practice. */
export async function createInvitation(actor: Actor, input: InviteInput): Promise<Result<InvitationLink>> {
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
): Promise<Result<InvitationLink>> {
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
 * active member of that practice, not a platform admin, not disabled, and have no membership of
 * any other practice, active or deactivated: a deactivated membership can be reactivated later,
 * and the reset password would then open that practice too. Otherwise only a platform admin may
 * make the link.
 */
function managerMayReset(practiceId: string, userId: string) {
  return sql`exists (
      select 1 from ${users} u
      join ${memberships} m on m.user_id = u.id and m.practice_id = ${practiceId} and m.deactivated_at is null
      where u.id = ${userId} and u.is_platform_admin = false and u.disabled_at is null
    )
    and not exists (
      select 1 from ${memberships} o
      where o.user_id = ${userId} and o.practice_id <> ${practiceId}
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
  /**
   * Invite only: the email already has an account with a password. The page then asks for that
   * account's current password ("enter your password to join <practice>") instead of a new one.
   * Always false for a reset.
   */
  existingAccount: boolean;
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
      resetPrivacyAckAt: users.privacyAckAt,
    })
    .from(invitations)
    .leftJoin(practices, eq(practices.id, invitations.practiceId))
    .leftJoin(users, eq(users.id, invitations.userId))
    .where(and(eq(invitations.tokenHash, hashToken(token)), usable(now)));
  if (!row) return null;
  let existingAccount = false;
  if (row.kind === 'invite') {
    const [account] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, row.email), isNotNull(users.passwordHash)));
    existingAccount = !!account;
  }
  return {
    kind: row.kind,
    email: row.email,
    name: row.name,
    practiceName: row.kind === 'invite' ? row.practiceName : null,
    expiresAt: row.expiresAt,
    existingAccount,
    needsPrivacyAck: row.kind === 'invite' || row.resetPrivacyAckAt === null,
  };
}

export type AcceptInvitationInput = {
  token: string;
  /**
   * A new password (new account, or a reset), or, for an invitation to an email that already has
   * an account, that account's current password. It is never changed in that case.
   */
  password: string;
  privacyAccepted: boolean;
  /** The caller's IP, for the sign-in throttle when an existing account's password is checked. */
  ip?: string | null;
};

const WRONG_CURRENT_PASSWORD =
  'That is not the password for your account. Enter the password you use to sign in. After several tries you will need to wait 15 minutes.';
const PRIVACY_NEEDED = 'Read the privacy notice and tick the box to say you have read it.';

/** Claims a link once: one `UPDATE ... WHERE used_at IS NULL ... RETURNING`. */
async function claim(invitationId: string, now: Date): Promise<boolean> {
  const rows = await getDb()
    .update(invitations)
    .set({ usedAt: now })
    .where(and(eq(invitations.id, invitationId), usable(now)))
    .returning({ id: invitations.id });
  return rows.length === 1;
}

/**
 * Uses an invitation or reset link, then starts a session:
 * - Invitation, email with no account (or one with no password): creates the account with this
 *   password, adds the membership.
 * - Invitation, email that already has an account: `password` must be that account's current
 *   password, checked like a sign-in (same throttle, same cost for a wrong guess). A wrong password
 *   does not use up the link. The account's password is never set or changed here.
 * - Reset: sets the new password and signs out every other session.
 *
 * Everything is checked before the claim; if a later step fails the link is spent and a new one
 * is needed, which leaves nothing unsafe behind.
 */
export async function acceptInvitation(input: AcceptInvitationInput): Promise<Result<NewSession>> {
  if (!isWellFormedToken(input.token)) return fail('not_found', LINK_UNUSABLE);
  const db = getDb();
  const now = new Date();

  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.tokenHash, hashToken(input.token)), usable(now)));
  if (!inv) return fail('not_found', LINK_UNUSABLE);

  if (inv.kind === 'reset') return applyResetLink(inv, input, now);

  // Invitation.
  if (input.privacyAccepted !== true) return fail('invalid', PRIVACY_NEEDED);
  const practiceId = inv.practiceId!;
  const [account] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, privacyAckAt: users.privacyAckAt })
    .from(users)
    .where(eq(users.email, inv.email));

  let userId: string;
  let existingAccount = false;
  if (account?.passwordHash) {
    const checked = await checkCredentials(inv.email, input.password, input.ip ?? null);
    if (!checked.ok) return fail(checked.code, WRONG_CURRENT_PASSWORD);
    if (!(await claim(inv.id, now))) return fail('not_found', LINK_UNUSABLE);
    userId = checked.userId;
    existingAccount = true;
    if (!account.privacyAckAt) await db.update(users).set({ privacyAckAt: now }).where(eq(users.id, userId));
  } else {
    const problem = checkPasswordPolicy(input.password, inv.email);
    if (problem) return fail('invalid', problem);
    const passwordHash = await hashPassword(input.password);
    if (!(await claim(inv.id, now))) return fail('not_found', LINK_UNUSABLE);
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
        // The account got a password between our check and the claim: never overwrite it.
        return fail('conflict', 'There is already an account for this email. Ask your manager for a new invitation link.');
      }
      userId = updated.id;
    }
  }

  await db
    .insert(memberships)
    .values({ practiceId, userId, role: inv.role!, canApproveScenarios: inv.canApproveScenarios })
    .onConflictDoUpdate({
      target: [memberships.practiceId, memberships.userId],
      set: { role: inv.role!, canApproveScenarios: inv.canApproveScenarios, deactivatedAt: null },
    });
  await audit({ userId }, 'invitation.accepted', { type: 'invitation', id: inv.id, practiceId }, { role: inv.role, existingAccount });
  await db.update(users).set({ lastSignInAt: now }).where(eq(users.id, userId));
  return { ok: true, ...(await createSession(userId, practiceId)) };
}

async function applyResetLink(inv: typeof invitations.$inferSelect, input: AcceptInvitationInput, now: Date): Promise<Result<NewSession>> {
  const db = getDb();
  const userId = inv.userId!;
  const [account] = await db
    .select({ id: users.id, email: users.email, privacyAckAt: users.privacyAckAt, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!account || account.disabledAt) return fail('not_found', LINK_UNUSABLE);

  const problem = checkPasswordPolicy(input.password, account.email);
  if (problem) return fail('invalid', problem);
  const needsPrivacyAck = !account.privacyAckAt;
  if (needsPrivacyAck && input.privacyAccepted !== true) return fail('invalid', PRIVACY_NEEDED);
  if (inv.practiceId) {
    // Made by a manager: the cross-practice rule must still hold now, not just when the link was made.
    const [check] = await queryRows<{ allowed: boolean }>(sql`select (${managerMayReset(inv.practiceId, userId)}) as allowed`);
    if (check?.allowed !== true) return fail('conflict', 'This link can no longer be used. Ask the platform administrator for a new one.');
  }

  const passwordHash = await hashPassword(input.password);
  if (!(await claim(inv.id, now))) return fail('not_found', LINK_UNUSABLE);

  await db
    .update(users)
    .set({ passwordHash, ...(needsPrivacyAck ? { privacyAckAt: now } : {}) })
    .where(eq(users.id, userId));
  await deleteUserSessions(userId);
  await db.update(users).set({ lastSignInAt: now }).where(eq(users.id, userId));
  await audit({ userId }, 'password.reset', { type: 'user', id: userId, practiceId: inv.practiceId }, { invitationId: inv.id });
  return { ok: true, ...(await createSession(userId, await defaultPracticeFor(userId))) };
}
