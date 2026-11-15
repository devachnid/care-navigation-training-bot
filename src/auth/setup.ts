import { sql } from 'drizzle-orm';
import { getDb, queryRows } from '@/db/client';
import { memberships, users } from '@/db/schema';
import { audit } from '@/audit/log';
import { cleanPracticeName, createPractice } from '@/practices/dal';
import type { Actor } from '@/policy/actor';
import { fail, type Result } from '@/policy/result';
import { cleanName, isPlausibleEmail, normaliseEmail } from './email';
import { checkPasswordPolicy, hashPassword } from './password';
import { createSession, type NewSession } from './sessions';
import { safeEqual } from './safe-equal';

/** `/setup` works only while there are no users at all. */
export async function isSetupOpen(): Promise<boolean> {
  const [row] = await queryRows<{ open: boolean }>(sql`select not exists (select 1 from ${users}) as open`);
  return row?.open === true;
}

export type SetupInput = {
  setupCode: string;
  name: string;
  email: string;
  password: string;
  practiceName: string;
  privacyAccepted: boolean;
};

const CLOSED = 'Setup has already been done. Sign in instead.';

/**
 * First run: creates the platform admin, the first practice and that person's manager membership,
 * then signs them in. Needs the `SETUP_CODE` env value and an empty `users` table.
 *
 * The admin is inserted with one `INSERT ... SELECT ... WHERE NOT EXISTS (users)` guarded by a
 * transaction-scoped advisory lock, so two simultaneous setups cannot both create an admin.
 */
export async function runSetup(input: SetupInput): Promise<Result<NewSession>> {
  const expected = process.env.SETUP_CODE ?? '';
  if (!expected) return fail('conflict', 'Setup is not switched on. Whoever deploys this app needs to set SETUP_CODE.');
  if (!(await isSetupOpen())) return fail('conflict', CLOSED);
  if (!safeEqual(input.setupCode.trim(), expected)) return fail('invalid', 'That setup code is not right. Check it and try again.');

  const email = normaliseEmail(input.email);
  const name = cleanName(input.name);
  if (!name) return fail('invalid', 'Enter your name (up to 80 characters).');
  if (!isPlausibleEmail(email)) return fail('invalid', 'Enter your email address, like name@example.com.');
  const problem = checkPasswordPolicy(input.password, email);
  if (problem) return fail('invalid', problem);
  if (!cleanPracticeName(input.practiceName)) return fail('invalid', 'Enter the practice name (2 to 120 characters).');
  if (input.privacyAccepted !== true) return fail('invalid', 'Read the privacy notice and tick the box to say you have read it.');

  const passwordHash = await hashPassword(input.password);
  const [admin] = await queryRows<{ id: string }>(sql`
    insert into ${users} (email, name, password_hash, is_platform_admin, privacy_ack_at)
    select ${email}, ${name}, ${passwordHash}, true, now()
    where pg_try_advisory_xact_lock(7240411) and not exists (select 1 from ${users})
    returning id
  `);
  if (!admin) return fail('conflict', CLOSED);

  const actor: Actor = { userId: admin.id, name, email, isPlatformAdmin: true, membership: null };
  await audit(actor, 'setup.completed', { type: 'user', id: admin.id, practiceId: null });
  const practice = await createPractice(actor, { name: input.practiceName });
  if (!practice.ok) throw new Error(`Setup could not create the practice: ${practice.error}`);
  await getDb()
    .insert(memberships)
    .values({ practiceId: practice.practiceId, userId: admin.id, role: 'manager', canApproveScenarios: false });
  await audit(actor, 'member.added', { type: 'user', id: admin.id, practiceId: practice.practiceId }, { role: 'manager' });
  return { ok: true, ...(await createSession(admin.id, practice.practiceId)) };
}
