import { describe, expect, it } from 'vitest';
import type { Actor } from './actor';
import { ABILITIES, can, type Ability } from './can';

const base = { userId: 'u', name: 'N', email: 'n@example.com' };
const member = (role: 'trainee' | 'manager', canApproveScenarios = false) => ({
  practiceId: 'p',
  practiceName: 'P',
  role,
  canApproveScenarios,
});

const ACTORS: Record<string, Actor> = {
  trainee: { ...base, isPlatformAdmin: false, membership: member('trainee') },
  manager: { ...base, isPlatformAdmin: false, membership: member('manager') },
  approverTrainee: { ...base, isPlatformAdmin: false, membership: member('trainee', true) },
  approverManager: { ...base, isPlatformAdmin: false, membership: member('manager', true) },
  adminNoMembership: { ...base, isPlatformAdmin: true, membership: null },
  adminWithTraineeMembership: { ...base, isPlatformAdmin: true, membership: member('trainee') },
  noMembership: { ...base, isPlatformAdmin: false, membership: null },
};

// Rows are abilities; each lists exactly the actors granted it (section 2 of the design).
const EXPECTED: Record<Ability, (keyof typeof ACTORS)[]> = {
  'calls.take': ['trainee', 'manager', 'approverTrainee', 'approverManager', 'adminWithTraineeMembership'],
  'sessions.viewOwn': ['trainee', 'manager', 'approverTrainee', 'approverManager', 'adminWithTraineeMembership'],
  'sessions.viewPractice': ['manager', 'approverManager'],
  'team.manage': ['manager', 'approverManager'],
  'reports.view': ['manager', 'approverManager'],
  'scenarios.manage': ['manager', 'approverTrainee', 'approverManager'],
  'scenarios.approve': ['approverTrainee', 'approverManager'],
  'scenarios.useDrafts': ['manager', 'approverTrainee', 'approverManager'],
  'practice.settings': ['manager', 'approverManager'],
  'platform.admin': ['adminNoMembership', 'adminWithTraineeMembership'],
};

describe('can()', () => {
  it('covers every ability in the table', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ABILITIES].sort());
  });

  for (const ability of ABILITIES) {
    for (const [who, actor] of Object.entries(ACTORS)) {
      const granted = EXPECTED[ability].includes(who);
      it(`${granted ? 'grants' : 'refuses'} ${ability} to ${who}`, () => {
        expect(can(actor, ability)).toBe(granted);
      });
    }
    it(`refuses ${ability} to nobody signed in`, () => {
      expect(can(null, ability)).toBe(false);
    });
  }

  it('a platform admin with a manager membership has manager abilities through the membership, not the flag', () => {
    const a: Actor = { ...base, isPlatformAdmin: true, membership: member('manager') };
    expect(can(a, 'team.manage')).toBe(true);
    expect(can(a, 'scenarios.approve')).toBe(false);
  });

  it('refuses an unknown ability', () => {
    expect(can(ACTORS.approverManager, 'everything' as Ability)).toBe(false);
  });
});
