/**
 * Makes a 24-hour password reset link for any account, for someone with database access
 * (for example a locked-out platform admin):
 *
 *   npm run admin:reset-link -- someone@example.com
 *
 * Uses DATABASE_URL from .env.local or the environment. Prints the link path once; it is not
 * stored anywhere else. Recorded in the audit log with no actor.
 *
 * The link is a credential, so it is only printed to an interactive terminal. If the output is
 * being captured (a CI log, a pipe, an automated runner) the script refuses before creating
 * anything, unless `--print-anyway` is given by someone who knows where the output is going.
 */
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const printAnyway = args.includes('--print-anyway');
  const email = args.find(a => !a.startsWith('--'));
  if (!email) {
    console.error('Usage: npm run admin:reset-link -- <email> [--print-anyway]');
    process.exit(2);
  }
  if (!process.stdout.isTTY && !printAnyway) {
    console.error(
      'Refusing to print a reset link: the output is not an interactive terminal, so it may be saved in a log.\n' +
        'No link was created. Run this in a terminal, or add --print-anyway if you are sure where the output goes.',
    );
    process.exit(3);
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
