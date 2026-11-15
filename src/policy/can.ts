import type { Actor } from './actor';

export const ABILITIES = [
  'calls.take',
  'sessions.viewOwn',
  'sessions.viewPractice',
  'team.manage',
  'reports.view',
  'scenarios.manage',
  'scenarios.approve',
  'scenarios.useDrafts',
  'practice.settings',
  'platform.admin',
] as const;

export type Ability = (typeof ABILITIES)[number];

/**
 * The one place abilities are decided (design section 2). Pure: no database, no request.
 * Platform admin grants only `platform.admin`; practice abilities always come from a membership.
 */
export function can(actor: Actor | null, ability: Ability): boolean {
  if (!actor) return false;
  const m = actor.membership;
  const member = m !== null;
  const manager = m?.role === 'manager';
  const approver = m?.canApproveScenarios === true;

  switch (ability) {
    case 'calls.take':
    case 'sessions.viewOwn':
      return member;
    case 'sessions.viewPractice':
    case 'team.manage':
    case 'reports.view':
    case 'practice.settings':
      return manager;
    case 'scenarios.manage':
    case 'scenarios.useDrafts':
      return manager || approver;
    case 'scenarios.approve':
      return approver;
    case 'platform.admin':
      return actor.isPlatformAdmin;
    default: {
      const unknown: never = ability;
      void unknown;
      return false;
    }
  }
}
