import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { memberships, practices, scenarios, users, type Role } from '@/db/schema';
import { hashPassword } from '@/auth/password';
import { createSession, loadActor } from '@/auth/sessions';
import type { Actor } from '@/policy/actor';
import { createPractice } from '@/practices/dal';
import { scenarios as library } from '@/scenarios/seed';

export const PASSWORD = 'kettle on the windowsill';
let passwordHash: Promise<string> | undefined;

/** Puts the seed library into `scenarios`, as `npm run db:seed` does. */
export async function seedLibrary(): Promise<void> {
  for (const s of library) await getDb().insert(scenarios).values(s).onConflictDoNothing();
}

export async function makeUser(over: Partial<typeof users.$inferInsert> = {}) {
  passwordHash ??= hashPassword(PASSWORD);
  const [u] = await getDb()
    .insert(users)
    .values({
      email: `user-${randomUUID()}@example.com`,
      name: 'Test User',
      passwordHash: await passwordHash,
      privacyAckAt: new Date(),
      ...over,
    })
    .returning();
  return u;
}

/** An actor straight from the database, as `getActor()` would build it, with a live session token. */
export async function signedIn(userId: string, practiceId: string | null): Promise<{ actor: Actor; token: string }> {
  const { token } = await createSession(userId, practiceId);
  const actor = await loadActor(token);
  if (!actor) throw new Error('fixture: could not load actor');
  return { actor, token };
}

export async function actorFor(userId: string, practiceId: string | null): Promise<Actor> {
  return (await signedIn(userId, practiceId)).actor;
}

let admin: Actor | undefined;
/** A platform admin with no membership. */
export async function platformAdmin(): Promise<Actor> {
  if (admin) {
    const [still] = await getDb().select({ id: users.id }).from(users).where(eq(users.id, admin.userId));
    if (still) return admin;
  }
  const u = await makeUser({ isPlatformAdmin: true, name: 'Platform Admin' });
  admin = await actorFor(u.id, null);
  return admin;
}

/** A practice (library copied in as drafts) and its first manager. */
export async function makePractice(name = 'Ty Gwyn Surgery') {
  const created = await createPractice(await platformAdmin(), { name });
  if (!created.ok) throw new Error(created.error);
  const practiceId = created.practiceId;
  const manager = await addMember(practiceId, 'manager');
  return { practiceId, manager };
}

/** A new user with a membership of the practice, signed in to it. */
export async function addMember(practiceId: string, role: Role, canApproveScenarios = false, name = `${role} person`) {
  const user = await makeUser({ name });
  await getDb().insert(memberships).values({ practiceId, userId: user.id, role, canApproveScenarios });
  const { actor, token } = await signedIn(user.id, practiceId);
  return { user, actor, token };
}

export async function suspend(practiceId: string) {
  await getDb().update(practices).set({ suspendedAt: new Date() }).where(eq(practices.id, practiceId));
}

export async function deactivate(practiceId: string, userId: string) {
  await getDb()
    .update(memberships)
    .set({ deactivatedAt: new Date() })
    .where(and(eq(memberships.practiceId, practiceId), eq(memberships.userId, userId)));
}
