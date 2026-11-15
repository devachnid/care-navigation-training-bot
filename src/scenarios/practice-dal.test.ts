import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { auditLog, practices, practiceScenarios, scenarios } from '@/db/schema';
import { ForbiddenError } from '@/policy/result';
import { createTestDb } from '@/test/db';
import { addMember, makePractice, platformAdmin, seedLibrary } from '@/test/fixtures';
import {
  addFromLibrary,
  approveScenario,
  createScenario,
  getScenario,
  listLibraryNotInPractice,
  listScenariosForManagement,
  listVisibleScenarios,
  setScenarioActive,
  updateScenario,
} from './practice-dal';
import { scenarios as library } from './seed';
import { pickContent } from './types';

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});

const content = () => pickContent(library[0]);

async function practiceWithRoles() {
  const p = await makePractice();
  const trainee = await addMember(p.practiceId, 'trainee');
  const approver = await addMember(p.practiceId, 'trainee', true);
  const all = await listScenariosForManagement(p.manager.actor);
  return { ...p, trainee, approver, all };
}

describe('practice scenarios: visibility', () => {
  it('trainees see only approved active scenarios; managers and approvers also see active drafts', async () => {
    const { manager, trainee, approver, all } = await practiceWithRoles();
    expect(all).toHaveLength(4);
    expect(await listVisibleScenarios(trainee.actor)).toEqual([]);
    expect(await listVisibleScenarios(manager.actor)).toHaveLength(4);
    expect(await listVisibleScenarios(approver.actor)).toHaveLength(4);

    const sore = all.find(s => s.libraryScenarioId === 'sore-throat')!;
    expect(await approveScenario(approver.actor, sore.id, sore.revision)).toEqual({ ok: true });
    expect((await listVisibleScenarios(trainee.actor)).map(s => s.id)).toEqual([sore.id]);

    // Inactive: hidden from everyone's call list, still in the management list.
    expect(await setScenarioActive(manager.actor, sore.id, false)).toEqual({ ok: true });
    expect(await listVisibleScenarios(trainee.actor)).toEqual([]);
    expect((await listVisibleScenarios(manager.actor)).map(s => s.id)).not.toContain(sore.id);
    expect((await listScenariosForManagement(manager.actor)).find(s => s.id === sore.id)).toMatchObject({ active: false, approved: true });
  });

  it('trainees see drafts when the practice allows draft scenarios', async () => {
    const { practiceId, trainee } = await practiceWithRoles();
    await getDb().update(practices).set({ allowDraftScenarios: true }).where(eq(practices.id, practiceId));
    expect(await listVisibleScenarios(trainee.actor)).toHaveLength(4);
  });

  it('the visible list carries no answer key', async () => {
    const { manager } = await practiceWithRoles();
    const [first] = await listVisibleScenarios(manager.actor);
    expect(Object.keys(first).sort()).toEqual(['active', 'approved', 'difficulty', 'id', 'libraryScenarioId', 'revision', 'title']);
  });

  it('trainees cannot read or manage scenarios; a platform admin without membership cannot list them', async () => {
    const { trainee, all } = await practiceWithRoles();
    await expect(getScenario(trainee.actor, all[0].id)).rejects.toThrow(ForbiddenError);
    await expect(updateScenario(trainee.actor, all[0].id, content())).rejects.toThrow(ForbiddenError);
    await expect(approveScenario(trainee.actor, all[0].id, 1)).rejects.toThrow(ForbiddenError);
    await expect(listVisibleScenarios(await platformAdmin())).rejects.toThrow(ForbiddenError);
  });

  it('a manager who is not an approver cannot approve', async () => {
    const { manager, all } = await practiceWithRoles();
    await expect(approveScenario(manager.actor, all[0].id, 1)).rejects.toThrow(ForbiddenError);
  });
});

describe('practice scenarios: tenancy', () => {
  it("another practice cannot read, list, edit, toggle or approve this practice's scenarios", async () => {
    const mine = await practiceWithRoles();
    const theirs = await makePractice();
    const theirApprover = await addMember(theirs.practiceId, 'manager', true);
    const target = mine.all[0];
    expect(await getScenario(theirApprover.actor, target.id)).toBeNull();
    expect((await listScenariosForManagement(theirApprover.actor)).map(s => s.id)).not.toContain(target.id);
    expect((await listVisibleScenarios(theirApprover.actor)).map(s => s.id)).not.toContain(target.id);
    expect(await updateScenario(theirApprover.actor, target.id, { ...content(), title: 'Hijacked' })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await setScenarioActive(theirApprover.actor, target.id, false)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await approveScenario(theirApprover.actor, target.id, 1)).toMatchObject({ ok: false, code: 'not_found' });
    const after = await getScenario(mine.manager.actor, target.id);
    expect(after).toMatchObject({ title: target.title, active: true, revision: 1, approvedRevision: null });
  });
});

describe('practice scenarios: editing and approval', () => {
  it('editing content bumps the revision and clears approval; toggling active does not', async () => {
    const { manager, approver, trainee, all } = await practiceWithRoles();
    const s = all[0];
    await approveScenario(approver.actor, s.id, 1);
    expect(await getScenario(manager.actor, s.id)).toMatchObject({ approved: true, approvedRevision: 1, approvedByName: approver.user.name });

    await setScenarioActive(manager.actor, s.id, false);
    await setScenarioActive(manager.actor, s.id, true);
    expect(await getScenario(manager.actor, s.id)).toMatchObject({ revision: 1, approved: true });

    const r = await updateScenario(manager.actor, s.id, { ...content(), title: 'Sore throat (practice version)' });
    expect(r).toEqual({ ok: true, revision: 2 });
    const after = await getScenario(manager.actor, s.id);
    expect(after).toMatchObject({ revision: 2, approved: false, approvedRevision: 1, title: 'Sore throat (practice version)' });
    expect(await listVisibleScenarios(trainee.actor)).toEqual([]);
  });

  it('approval is for the revision reviewed: a stale revision approves nothing', async () => {
    const { manager, approver, all } = await practiceWithRoles();
    const s = all[0];
    await updateScenario(manager.actor, s.id, content());
    expect(await approveScenario(approver.actor, s.id, 1)).toMatchObject({ ok: false, code: 'conflict' });
    expect(await approveScenario(approver.actor, s.id, 2)).toEqual({ ok: true });
    const logged = await getDb().select().from(auditLog).where(and(eq(auditLog.action, 'scenario.approved'), eq(auditLog.targetId, s.id)));
    expect(logged).toHaveLength(1);
  });

  it('refuses to overwrite a newer edit when expectedRevision is given', async () => {
    const { manager, approver, all } = await practiceWithRoles();
    const s = all[0];
    expect(await updateScenario(approver.actor, s.id, content(), 1)).toEqual({ ok: true, revision: 2 });
    expect(await updateScenario(manager.actor, s.id, content(), 1)).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('validates content', async () => {
    const { manager, all } = await practiceWithRoles();
    expect(await updateScenario(manager.actor, all[0].id, { ...content(), title: '' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await createScenario(manager.actor, { ...content(), hiddenFacts: [] })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await createScenario(manager.actor, 'nonsense')).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('an approver (trainee) can write a practice scenario, which starts as a draft', async () => {
    const { approver, trainee } = await practiceWithRoles();
    const r = await createScenario(approver.actor, { ...content(), title: 'Our own one' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await getScenario(approver.actor, r.id)).toMatchObject({ title: 'Our own one', libraryScenarioId: null, revision: 1, approved: false });
    expect((await listVisibleScenarios(trainee.actor)).map(s => s.id)).not.toContain(r.id);
  });
});

describe('practice scenarios: library', () => {
  it('lists library scenarios not yet in the practice and adds one as a draft, once', async () => {
    const { practiceId, manager } = await makePractice();
    const theirs = await makePractice();
    await getDb().insert(scenarios).values({ ...library[0], id: 'new-in-library', title: 'Brand new' });
    try {
      expect((await listLibraryNotInPractice(manager.actor)).map(s => s.id)).toEqual(['new-in-library']);
      const r = await addFromLibrary(manager.actor, 'new-in-library');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(await getScenario(manager.actor, r.id)).toMatchObject({ title: 'Brand new', libraryScenarioId: 'new-in-library', revision: 1, approved: false });
      expect(await listLibraryNotInPractice(manager.actor)).toEqual([]);
      expect(await addFromLibrary(manager.actor, 'new-in-library')).toMatchObject({ ok: false, code: 'conflict' });
      expect(await addFromLibrary(manager.actor, 'does-not-exist')).toMatchObject({ ok: false, code: 'not_found' });
      // The other practice is unaffected.
      expect((await listLibraryNotInPractice(theirs.manager.actor)).map(s => s.id)).toEqual(['new-in-library']);
      const rows = await getDb().select().from(practiceScenarios).where(eq(practiceScenarios.libraryScenarioId, 'new-in-library'));
      expect(rows.map(x => x.practiceId)).toEqual([practiceId]);
    } finally {
      await getDb().delete(practiceScenarios).where(eq(practiceScenarios.libraryScenarioId, 'new-in-library'));
      await getDb().delete(scenarios).where(eq(scenarios.id, 'new-in-library'));
    }
  });

  it('does not add an inactive library scenario', async () => {
    const { manager } = await makePractice();
    await getDb().insert(scenarios).values({ ...library[0], id: 'retired', active: false });
    try {
      expect(await addFromLibrary(manager.actor, 'retired')).toMatchObject({ ok: false, code: 'not_found' });
    } finally {
      await getDb().delete(scenarios).where(eq(scenarios.id, 'retired'));
    }
  });
});
