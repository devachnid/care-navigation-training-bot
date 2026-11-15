import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { getDb, queryRows } from '@/db/client';
import { practices, practiceScenarios, scenarios, users } from '@/db/schema';
import { audit } from '@/audit/log';
import type { Actor, MemberActor } from '@/policy/actor';
import { can } from '@/policy/can';
import { assertMember, fail, isUuid, type Result } from '@/policy/result';
import { CONTENT_KEYS, pickContent, scenarioContentSchema, type ScenarioContent } from './types';

const NOT_FOUND = 'That scenario could not be found.';

export type ScenarioSummary = {
  id: string;
  title: string;
  difficulty: ScenarioContent['difficulty'];
  /** null for a scenario the practice wrote itself. */
  libraryScenarioId: string | null;
  revision: number;
  /** approved_revision = revision */
  approved: boolean;
  active: boolean;
};

export type PracticeScenario = ScenarioSummary &
  ScenarioContent & {
    approvedRevision: number | null;
    approvedAt: Date | null;
    approvedByName: string | null;
    updatedAt: Date;
  };

const summaryFields = {
  id: practiceScenarios.id,
  title: practiceScenarios.title,
  difficulty: practiceScenarios.difficulty,
  libraryScenarioId: practiceScenarios.libraryScenarioId,
  revision: practiceScenarios.revision,
  approved: sql<boolean>`coalesce(${practiceScenarios.approvedRevision} = ${practiceScenarios.revision}, false)`,
  active: practiceScenarios.active,
};

const ORDER = [sql`case ${practiceScenarios.difficulty} when 'easy' then 0 when 'medium' then 1 else 2 end`, asc(practiceScenarios.title)];

/**
 * The visibility rule (design section 4), as SQL on `practice_scenarios`, for the actor's practice:
 * active, and either approved or the practice allows drafts. Managers and approvers
 * (`scenarios.useDrafts`) also see active drafts so they can test them.
 */
export function callableScenarioWhere(actor: MemberActor): SQL {
  const practiceId = actor.membership.practiceId;
  const base = and(eq(practiceScenarios.practiceId, practiceId), eq(practiceScenarios.active, true))!;
  if (can(actor, 'scenarios.useDrafts')) return base;
  return and(
    base,
    sql`(${practiceScenarios.approvedRevision} = ${practiceScenarios.revision}
      or exists (select 1 from ${practices} where ${practices.id} = ${practiceId} and ${practices.allowDraftScenarios}))`,
  )!;
}

/** Scenarios the actor can call, easiest first. No answer keys. */
export async function listVisibleScenarios(actor: Actor): Promise<ScenarioSummary[]> {
  assertMember(actor, 'calls.take');
  return getDb()
    .select(summaryFields)
    .from(practiceScenarios)
    .where(callableScenarioWhere(actor))
    .orderBy(...ORDER);
}

/** Every scenario in the practice, inactive ones included, with approval state. */
export async function listScenariosForManagement(actor: Actor): Promise<ScenarioSummary[]> {
  assertMember(actor, 'scenarios.manage');
  return getDb()
    .select(summaryFields)
    .from(practiceScenarios)
    .where(eq(practiceScenarios.practiceId, actor.membership.practiceId))
    .orderBy(...ORDER);
}

/** One scenario with its answer key, for managers and approvers. Null if not in the actor's practice. */
export async function getScenario(actor: Actor, id: string): Promise<PracticeScenario | null> {
  assertMember(actor, 'scenarios.manage');
  if (!isUuid(id)) return null;
  const [row] = await getDb()
    .select({ s: practiceScenarios, approvedByName: users.name })
    .from(practiceScenarios)
    .leftJoin(users, eq(users.id, practiceScenarios.approvedBy))
    .where(and(eq(practiceScenarios.id, id), eq(practiceScenarios.practiceId, actor.membership.practiceId)));
  if (!row) return null;
  const s = row.s;
  return {
    ...pickContent(s),
    id: s.id,
    libraryScenarioId: s.libraryScenarioId,
    revision: s.revision,
    approved: s.approvedRevision === s.revision,
    active: s.active,
    approvedRevision: s.approvedRevision,
    approvedAt: s.approvedAt,
    approvedByName: row.approvedByName,
    updatedAt: s.updatedAt,
  };
}

function parseContent(input: unknown): Result<{ content: ScenarioContent }> {
  const parsed = scenarioContentSchema.safeParse(input);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join(' > ') || 'the scenario';
    return fail('invalid', `Check ${where}: it is missing, too long or not valid.`);
  }
  return { ok: true, content: parsed.data };
}

/** A scenario the practice writes itself. Starts as a draft (revision 1, not approved). */
export async function createScenario(actor: Actor, input: unknown): Promise<Result<{ id: string }>> {
  assertMember(actor, 'scenarios.manage');
  const parsed = parseContent(input);
  if (!parsed.ok) return parsed;
  const [row] = await getDb()
    .insert(practiceScenarios)
    .values({ ...parsed.content, practiceId: actor.membership.practiceId, libraryScenarioId: null, updatedBy: actor.userId })
    .returning({ id: practiceScenarios.id });
  await audit(actor, 'scenario.created', { type: 'practice_scenario', id: row.id }, { title: parsed.content.title });
  return { ok: true, id: row.id };
}

/**
 * Replaces a scenario's content and adds one to `revision`, which makes it a draft again until
 * re-approved. Pass `expectedRevision` (the revision the editor opened) to refuse overwriting
 * someone else's newer edit.
 */
export async function updateScenario(
  actor: Actor,
  id: string,
  input: unknown,
  expectedRevision?: number,
): Promise<Result<{ revision: number }>> {
  assertMember(actor, 'scenarios.manage');
  if (!isUuid(id)) return fail('not_found', NOT_FOUND);
  const parsed = parseContent(input);
  if (!parsed.ok) return parsed;
  const where = and(
    eq(practiceScenarios.id, id),
    eq(practiceScenarios.practiceId, actor.membership.practiceId),
    expectedRevision === undefined ? undefined : eq(practiceScenarios.revision, expectedRevision),
  );
  const [row] = await getDb()
    .update(practiceScenarios)
    .set({
      ...parsed.content,
      revision: sql`${practiceScenarios.revision} + 1`,
      updatedAt: new Date(),
      updatedBy: actor.userId,
    })
    .where(where)
    .returning({ revision: practiceScenarios.revision });
  if (!row) return missingOrChanged(actor, id);
  await audit(actor, 'scenario.updated', { type: 'practice_scenario', id }, { revision: row.revision });
  return { ok: true, revision: row.revision };
}

async function missingOrChanged(actor: MemberActor, id: string): Promise<Result<never>> {
  const [exists] = await getDb()
    .select({ id: practiceScenarios.id })
    .from(practiceScenarios)
    .where(and(eq(practiceScenarios.id, id), eq(practiceScenarios.practiceId, actor.membership.practiceId)));
  return exists
    ? fail('conflict', 'Someone else has changed this scenario since you opened it. Reload it to see their changes.')
    : fail('not_found', NOT_FOUND);
}

/** Shows or hides a scenario. Does not change its revision or approval. */
export async function setScenarioActive(actor: Actor, id: string, active: boolean): Promise<Result> {
  assertMember(actor, 'scenarios.manage');
  if (!isUuid(id)) return fail('not_found', NOT_FOUND);
  const [row] = await getDb()
    .update(practiceScenarios)
    .set({ active: active === true })
    .where(and(eq(practiceScenarios.id, id), eq(practiceScenarios.practiceId, actor.membership.practiceId)))
    .returning({ id: practiceScenarios.id });
  if (!row) return fail('not_found', NOT_FOUND);
  await audit(actor, active ? 'scenario.activated' : 'scenario.deactivated', { type: 'practice_scenario', id });
  return { ok: true };
}

/**
 * A clinician approver approves exactly the revision they reviewed. If the scenario has been
 * edited since, nothing is approved.
 */
export async function approveScenario(actor: Actor, id: string, revision: number): Promise<Result> {
  assertMember(actor, 'scenarios.approve');
  if (!isUuid(id)) return fail('not_found', NOT_FOUND);
  if (!Number.isInteger(revision)) return fail('invalid', 'Reload the scenario and try again.');
  const [row] = await getDb()
    .update(practiceScenarios)
    .set({ approvedRevision: revision, approvedBy: actor.userId, approvedAt: new Date() })
    .where(
      and(
        eq(practiceScenarios.id, id),
        eq(practiceScenarios.practiceId, actor.membership.practiceId),
        eq(practiceScenarios.revision, revision),
      ),
    )
    .returning({ id: practiceScenarios.id });
  if (!row) return missingOrChanged(actor, id);
  await audit(actor, 'scenario.approved', { type: 'practice_scenario', id }, { revision });
  return { ok: true };
}

export type LibraryScenarioSummary = { id: string; title: string; difficulty: ScenarioContent['difficulty'] };

/** Active library scenarios this practice does not have yet ("available to add"). */
export async function listLibraryNotInPractice(actor: Actor): Promise<LibraryScenarioSummary[]> {
  assertMember(actor, 'scenarios.manage');
  return getDb()
    .select({ id: scenarios.id, title: scenarios.title, difficulty: scenarios.difficulty })
    .from(scenarios)
    .where(
      and(
        eq(scenarios.active, true),
        sql`not exists (select 1 from ${practiceScenarios} ps
          where ps.practice_id = ${actor.membership.practiceId} and ps.library_scenario_id = ${scenarios.id})`,
      ),
    )
    .orderBy(asc(scenarios.title));
}

/** Copies one active library scenario into the practice as a draft. */
export async function addFromLibrary(actor: Actor, libraryScenarioId: string): Promise<Result<{ id: string }>> {
  assertMember(actor, 'scenarios.manage');
  if (typeof libraryScenarioId !== 'string' || !/^[a-z0-9-]{1,100}$/.test(libraryScenarioId)) return fail('not_found', NOT_FOUND);
  const practiceId = actor.membership.practiceId;
  const cols = CONTENT_KEYS.map(k => sql.identifier(practiceScenarios[k].name));
  const src = CONTENT_KEYS.map(k => sql`${scenarios}.${sql.identifier(scenarios[k].name)}`);
  const [row] = await queryRows<{ id: string }>(sql`
    insert into ${practiceScenarios} (practice_id, library_scenario_id, revision, active, updated_by, ${sql.join(cols, sql`, `)})
    select ${practiceId}::uuid, ${scenarios.id}, 1, true, ${actor.userId}::uuid, ${sql.join(src, sql`, `)}
    from ${scenarios}
    where ${scenarios.id} = ${libraryScenarioId} and ${scenarios.active} = true
    on conflict (practice_id, library_scenario_id) do nothing
    returning id
  `);
  if (!row) {
    const [already] = await getDb()
      .select({ id: practiceScenarios.id })
      .from(practiceScenarios)
      .where(and(eq(practiceScenarios.practiceId, practiceId), eq(practiceScenarios.libraryScenarioId, libraryScenarioId)));
    return already ? fail('conflict', 'Your practice already has this scenario.') : fail('not_found', NOT_FOUND);
  }
  await audit(actor, 'scenario.added_from_library', { type: 'practice_scenario', id: row.id }, { libraryScenarioId });
  return { ok: true, id: row.id };
}
