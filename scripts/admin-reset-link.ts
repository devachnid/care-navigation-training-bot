/**
 * Makes a 24-hour password reset link for any account, for someone with database access
 * (for example a locked-out platform admin):
 *
 *   npm run admin:reset-link -- someone@example.com
 *
 * Uses DATABASE_URL from .env.local or the environment. Prints the link path once; it is not
 * stored anywhere else. Recorded in the audit log with no actor.
 */
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run admin:reset-link -- <email>');
    process.exit(2);
  }
  const { createResetLinkFromCommandLine } = await import('../src/auth/invitations');
  const r = await createResetLinkFromCommandLine(email);
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  console.log(`Reset link (works once, until ${r.expiresAt.toISOString()}):`);
  console.log(`  /invite/${r.token}`);
  console.log('Add the site address in front, for example https://<your-site>/invite/...');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
