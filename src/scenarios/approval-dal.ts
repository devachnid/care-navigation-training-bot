import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { memberships, practiceScenarios, users } from '@/db/schema';
import type { Actor } from '@/policy/actor';
import { assertMember } from '@/policy/result';

/**
 * Approval details the scenario pages need that `practice-dal.ts` does not list: who last approved
 * each scenario, and who in the practice can approve. Both are for people who manage scenarios.
 */

export type ApprovalInfo = {
  scenarioId: string;
  /** The revision last approved, or null if never approved. It can be behind the current revision. */
  approvedRevision: number | null;
  approvedAt: Date | null;
  approvedByName: string | null;
};

/** The last approval of every scenario in the actor's practice (never-approved ones have nulls). */
export async function listApprovalInfo(actor: Actor): Promise<ApprovalInfo[]> {
  assertMember(actor, 'scenarios.manage');
  return getDb()
    .select({
      scenarioId: practiceScenarios.id,
      approvedRevision: practiceScenarios.approvedRevision,
      approvedAt: practiceScenarios.approvedAt,
      approvedByName: users.name,
    })
    .from(practiceScenarios)
    .leftJoin(users, eq(users.id, practiceScenarios.approvedBy))
    .where(eq(practiceScenarios.practiceId, actor.membership.practiceId));
}

/** Names of the people in the actor's practice who can approve scenarios now (active, account not disabled), by name. */
export async function listApproverNames(actor: Actor): Promise<string[]> {
  assertMember(actor, 'scenarios.manage');
  const rows = await getDb()
    .select({ name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.practiceId, actor.membership.practiceId),
        eq(memberships.canApproveScenarios, true),
        isNull(memberships.deactivatedAt),
        isNull(users.disabledAt),
      ),
    );
  return rows.map(r => r.name).sort((a, b) => a.localeCompare(b, 'en-GB'));
}
