import { desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getDb } from '@/db/client';
import { auditLog, invitations, practiceScenarios, users } from '@/db/schema';
import type { Actor } from '@/policy/actor';
import { assertMember } from '@/policy/result';
import { describeAudit } from './describe';

export type AuditEntry = {
  id: string;
  at: Date;
  /** Who did it, or null for a change made from the command line. */
  actorName: string | null;
  /** The entry as one sentence (see `describeAudit`). */
  summary: string;
};

/** The most entries a caller can ask for. */
export const MAX_AUDIT_ENTRIES = 200;

/**
 * Manager: the practice's audit log, newest first, each entry already worded as a sentence. Only
 * entries recorded against the actor's own practice; the names of the people, scenarios and
 * invitations they point at are looked up within that practice too.
 */
export async function listAuditEntries(actor: Actor, limit = 50): Promise<AuditEntry[]> {
  assertMember(actor, 'practice.settings');
  const practiceId = actor.membership.practiceId;
  const n = Math.min(Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 50)), MAX_AUDIT_ENTRIES);
  const doer = alias(users, 'doer');
  const target = alias(users, 'target');
  const rows = await getDb()
    .select({
      id: auditLog.id,
      at: auditLog.at,
      action: auditLog.action,
      detail: auditLog.detail,
      actorName: doer.name,
      targetName: target.name,
      scenarioTitle: practiceScenarios.title,
      invitationName: invitations.name,
    })
    .from(auditLog)
    .leftJoin(doer, eq(doer.id, auditLog.actorUserId))
    .leftJoin(target, sql`${auditLog.targetType} = 'user' and ${target.id}::text = ${auditLog.targetId}`)
    .leftJoin(
      practiceScenarios,
      sql`${auditLog.targetType} = 'practice_scenario' and ${practiceScenarios.id}::text = ${auditLog.targetId} and ${practiceScenarios.practiceId} = ${practiceId}`,
    )
    .leftJoin(
      invitations,
      sql`${auditLog.targetType} = 'invitation' and ${invitations.id}::text = ${auditLog.targetId} and ${invitations.practiceId} = ${practiceId}`,
    )
    .where(eq(auditLog.practiceId, practiceId))
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(n);
  return rows.map(r => ({
    id: r.id,
    at: r.at,
    actorName: r.actorName,
    summary: describeAudit({
      action: r.action,
      targetName: r.targetName,
      subjectName: r.scenarioTitle ?? r.invitationName,
      detail: r.detail,
    }),
  }));
}
