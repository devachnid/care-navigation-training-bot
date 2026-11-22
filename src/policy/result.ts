import type { Actor, MemberActor } from './actor';
import { can, type Ability } from './can';

/**
 * Why something was refused. Pages branch on `code`; `error` is a message a member of
 * reception staff can read and act on.
 * - not_found: does not exist, or is in another practice (never "forbidden" for that).
 * - invalid: the input was wrong.
 * - conflict: the state does not allow it (e.g. last manager, link already used).
 * - limit: a limit was reached (e.g. daily calls).
 */
export type FailCode = 'not_found' | 'invalid' | 'conflict' | 'limit';
export type Fail = { ok: false; code: FailCode; error: string };
export type Result<T extends object = object> = ({ ok: true } & T) | Fail;

export const fail = (code: FailCode, error: string): Fail => ({ ok: false, code, error });

/**
 * Thrown when a data-access function is called by someone without the ability.
 * Server actions and route handlers check `can()` first (architecture rule 3), so reaching
 * this means a missing check: it is a bug, not a user error.
 */
export class ForbiddenError extends Error {
  constructor(readonly ability: Ability) {
    super(`Not allowed: ${ability}`);
    this.name = 'ForbiddenError';
  }
}

/** Throws ForbiddenError unless the actor has the ability. */
export function assertCan(actor: Actor | null, ability: Ability): asserts actor is Actor {
  if (!can(actor, ability)) throw new ForbiddenError(ability);
}

/** Throws ForbiddenError unless the actor has the ability within a practice. */
export function assertMember(actor: Actor | null, ability: Ability): asserts actor is MemberActor {
  if (!actor?.membership || !can(actor, ability)) throw new ForbiddenError(ability);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from URLs are checked before they reach SQL, so a malformed one is simply "not found". */
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);
