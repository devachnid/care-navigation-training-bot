import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { memberships, users } from '@/db/schema';
import { ForbiddenError } from '@/policy/result';
import { createTestDb } from '@/test/db';
import { addMember, deactivate, makePractice, seedLibrary } from '@/test/fixtures';
import { listApprovalInfo, listApproverNames } from './approval-dal';
import { approveScenario, getScenario, listScenariosForManagement, updateScenario } from './practice-dal';
import { pickContent } from './types';

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});

describe('listApprovalInfo', () => {
  it('shows who approved which revision, and keeps the old approval after a later edit', async () => {
    const { manager, practiceId } = await makePractice();
    const clinician = await addMember(practiceId, 'trainee', true, 'Dr Olwen Price');
    const [first] = await listScenariosForManagement(manager.actor);

    let info = await listApprovalInfo(manager.actor);
    expect(info).toHaveLength(4);
    expect(info.every(i => i.approvedRevision === null && i.approvedByName === null)).toBe(true);

    expect(await approveScenario(clinician.actor, first.id, first.revision)).toEqual({ ok: true });
    info = await listApprovalInfo(manager.actor);
    const row = info.find(i => i.scenarioId === first.id)!;
    expect(row.approvedRevision).toBe(first.revision);
    expect(row.approvedByName).toBe('Dr Olwen Price');
    expect(row.approvedAt).toBeInstanceOf(Date);

    const current = (await getScenario(manager.actor, first.id))!;
    expect(await updateScenario(manager.actor, first.id, { ...pickContent(current), title: 'Changed' }, current.revision)).toMatchObject({ ok: true });
    const after = (await listApprovalInfo(manager.actor)).find(i => i.scenarioId === first.id)!;
    expect(after.approvedRevision).toBe(first.revision);
    expect(after.approvedByName).toBe('Dr Olwen Price');
  });

  it('does not show another practice its rows, and refuses plain trainees', async () => {
    const a = await makePractice('Approvals A');
    const b = await makePractice('Approvals B');
    const plain = await addMember(a.practiceId, 'trainee');
    const idsA = new Set((await listApprovalInfo(a.manager.actor)).map(i => i.scenarioId));
    const idsB = (await listApprovalInfo(b.manager.actor)).map(i => i.scenarioId);
    expect(idsB).toHaveLength(4);
    expect(idsB.some(id => idsA.has(id))).toBe(false);
    await expect(listApprovalInfo(plain.actor)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('listApproverNames', () => {
  it('lists active approvers of this practice only, by name', async () => {
    const a = await makePractice('Approvers A');
    const b = await makePractice('Approvers B');
    expect(await listApproverNames(a.manager.actor)).toEqual([]);
    await addMember(a.practiceId, 'trainee', true, 'Zara Clinician');
    const gone = await addMember(a.practiceId, 'trainee', true, 'Gone Clinician');
    const disabled = await addMember(a.practiceId, 'manager', true, 'Disabled Clinician');
    await addMember(a.practiceId, 'trainee', false, 'Not A Clinician');
    await addMember(a.practiceId, 'trainee', true, 'Alun Clinician');
    await addMember(b.practiceId, 'trainee', true, 'Other Practice Clinician');
    await deactivate(a.practiceId, gone.user.id);
    await getDb().update(users).set({ disabledAt: new Date() }).where(eq(users.id, disabled.user.id));
    await getDb()
      .update(memberships)
      .set({ canApproveScenarios: true })
      .where(and(eq(memberships.practiceId, a.practiceId), eq(memberships.userId, a.manager.user.id)));

    expect(await listApproverNames(a.manager.actor)).toEqual(['Alun Clinician', 'manager person', 'Zara Clinician']);
    expect(await listApproverNames(b.manager.actor)).toEqual(['Other Practice Clinician']);
  });

  it('refuses a plain trainee', async () => {
    const p = await makePractice('Approvers C');
    const plain = await addMember(p.practiceId, 'trainee');
    await expect(listApproverNames(plain.actor)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
