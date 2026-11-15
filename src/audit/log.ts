import { getDb } from '@/db/client';
import { auditLog } from '@/db/schema';
import type { Actor } from '@/policy/actor';

export type AuditTarget = {
  type: string;
  id: string;
  /** The practice the change is about, when it is not the actor's own (platform admin actions). */
  practiceId?: string | null;
};

/** An Actor, or just the user id of someone acting before they have a session (accepting an invitation). */
export type AuditActor = Pick<Actor, 'userId'> & { membership?: Actor['membership'] };

/**
 * Records a change to who can see or do what (architecture rule 8).
 * Called after the change succeeds, with `actor` null for changes made from the command line.
 */
export async function audit(
  actor: AuditActor | null,
  action: string,
  target?: AuditTarget,
  detail?: Record<string, unknown>,
): Promise<void> {
  await getDb()
    .insert(auditLog)
    .values({
      actorUserId: actor?.userId ?? null,
      practiceId: target?.practiceId !== undefined ? target.practiceId : (actor?.membership?.practiceId ?? null),
      action,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
      detail: detail ?? null,
    });
}
