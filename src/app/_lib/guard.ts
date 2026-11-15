import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { requireActor } from '@/auth/current';
import type { Actor, MemberActor } from '@/policy/actor';
import { can, type Ability } from '@/policy/can';

/** An ability that comes from a practice membership (everything except `platform.admin`). */
export type PracticeAbility = Exclude<Ability, 'platform.admin'>;

/**
 * Pages and actions: the signed-in person acting in a practice.
 * - Not signed in: redirect to `/sign-in`.
 * - Signed in with no active practice: a platform admin goes to `/admin`; anyone else to
 *   `/no-access`, which says they no longer have access and offers sign out.
 * Never rely on the (app) layout for this: every page, action and route handler calls it itself.
 */
export async function requireMember(): Promise<MemberActor> {
  const actor = await requireActor();
  if (!actor.membership) redirect(actor.isPlatformAdmin ? '/admin' : '/no-access');
  return actor as MemberActor;
}

/**
 * A member who has `ability`, or `notFound()` (we do not say a page exists to someone who may not
 * see it). `platform.admin` needs no practice, so it returns a plain `Actor`.
 */
export async function requireAbility(ability: PracticeAbility): Promise<MemberActor>;
export async function requireAbility(ability: 'platform.admin'): Promise<Actor>;
export async function requireAbility(ability: Ability): Promise<Actor> {
  if (ability === 'platform.admin') {
    const actor = await requireActor();
    if (!can(actor, ability)) notFound();
    return actor;
  }
  const actor = await requireMember();
  if (!can(actor, ability)) notFound();
  return actor;
}

export type NavItem = { href: string; label: string };

/**
 * The main navigation for this person, by ability. Pages behind the last five links are built by
 * other pages' owners; each one still checks access itself.
 */
export function navFor(actor: Actor): NavItem[] {
  const items: (NavItem & { ability: Ability })[] = [
    { href: '/', label: 'Practise', ability: 'calls.take' },
    { href: '/history', label: 'My calls', ability: 'sessions.viewOwn' },
    { href: '/team', label: 'Team', ability: 'team.manage' },
    { href: '/reports', label: 'Reports', ability: 'reports.view' },
    { href: '/scenarios', label: 'Scenarios', ability: 'scenarios.manage' },
    { href: '/settings', label: 'Settings', ability: 'practice.settings' },
    { href: '/admin', label: 'Admin', ability: 'platform.admin' },
  ];
  return items.filter(i => can(actor, i.ability)).map(({ href, label }) => ({ href, label }));
}
