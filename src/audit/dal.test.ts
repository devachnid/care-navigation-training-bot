import { beforeAll, describe, expect, it } from 'vitest';
import { createInvitation, revokeInvitation } from '@/auth/invitations';
import { changeMemberRole, deactivateMember, updatePracticeSettings } from '@/practices/dal';
import { ForbiddenError } from '@/policy/result';
import { approveScenario, listScenariosForManagement } from '@/scenarios/practice-dal';
import { createTestDb } from '@/test/db';
import { addMember, makePractice, seedLibrary } from '@/test/fixtures';
import { audit } from './log';
import { listAuditEntries } from './dal';

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
});

async function setup() {
  const p = await makePractice();
  const approver = await addMember(p.practiceId, 'trainee', true, 'Clinician Approver');
  const trainee = await addMember(p.practiceId, 'trainee', false, 'Tom Hughes');
  return { ...p, approver, trainee };
}

describe('listAuditEntries', () => {
  it('words each entry, names the person who acted, and puts the newest first', async () => {
    const { manager, approver, trainee } = await setup();
    const invite = await createInvitation(manager.actor, { email: 'siobhan@example.com', name: 'Siobhan Kearney', role: 'trainee', canApproveScenarios: false });
    if (!invite.ok) throw new Error(invite.error);
    await changeMemberRole(manager.actor, trainee.user.id, 'manager');
    await deactivateMember(manager.actor, trainee.user.id);
    const scenario = (await listScenariosForManagement(manager.actor)).find(s => s.libraryScenarioId === 'sore-throat')!;
    await approveScenario(approver.actor, scenario.id, 1);
    await updatePracticeSettings(manager.actor, { allowDraftScenarios: true });

    const entries = await listAuditEntries(manager.actor);
    expect(entries.map(e => e.summary)).toEqual([
      'Let staff practise on draft scenarios',
      `Approved the scenario ${scenario.title}`,
      'Deactivated Tom Hughes',
      'Changed Tom Hughes to a manager',
      'Invited Siobhan Kearney as a trainee',
      expect.stringContaining('Set up the practice'),
    ]);
    expect(entries[0].actorName).toBe(manager.user.name);
    expect(entries[1].actorName).toBe('Clinician Approver');
    expect(entries[0].at.getTime()).toBeGreaterThanOrEqual(entries[1].at.getTime());
  });

  it('names an invitation that was cancelled', async () => {
    const { manager } = await setup();
    const invite = await createInvitation(manager.actor, { email: 'ed@example.com', name: 'Ed Evans', role: 'trainee', canApproveScenarios: false });
    if (!invite.ok || !('invitationId' in invite)) throw new Error('expected a link');
    await revokeInvitation(manager.actor, invite.invitationId);
    expect((await listAuditEntries(manager.actor))[0].summary).toBe('Cancelled the invitation for Ed Evans');
  });

  it('respects the limit', async () => {
    const { manager, trainee } = await setup();
    for (let i = 0; i < 4; i++) await audit(manager.actor, 'member.deactivated', { type: 'user', id: trainee.user.id });
    expect(await listAuditEntries(manager.actor, 2)).toHaveLength(2);
    expect((await listAuditEntries(manager.actor, 0)).length).toBe(1);
  });

  it("shows only this practice's entries and never looks up names from another practice", async () => {
    const mine = await setup();
    const theirs = await setup();
    await changeMemberRole(theirs.manager.actor, theirs.trainee.user.id, 'manager');
    // A stray entry in my practice that points at someone's scenario and invitation in the other practice.
    const theirScenario = (await listScenariosForManagement(theirs.manager.actor))[0];
    await audit(mine.manager.actor, 'scenario.approved', { type: 'practice_scenario', id: theirScenario.id });
    const entries = await listAuditEntries(mine.manager.actor);
    expect(entries.some(e => e.summary.includes('Tom Hughes'))).toBe(false);
    expect(entries[0].summary).toBe('Approved the scenario a scenario');
    expect(entries.some(e => e.summary.includes(theirScenario.title))).toBe(false);
    const theirEntries = await listAuditEntries(theirs.manager.actor);
    expect(theirEntries[0].summary).toBe('Changed Tom Hughes to a manager');
  });

  it('is for managers only', async () => {
    const { trainee, approver } = await setup();
    await expect(listAuditEntries(trainee.actor)).rejects.toThrow(ForbiddenError);
    await expect(listAuditEntries(approver.actor)).rejects.toThrow(ForbiddenError);
  });
});
