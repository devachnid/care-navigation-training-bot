/**
 * The end-to-end suite creates practices, people and calls in a real database. It must never run
 * against production, and only runs when someone has said they mean it.
 */

/** The start of the production database's host name. Never allowed. */
export const PRODUCTION_HOST_PREFIX = 'ep-dry-wildflower';

export function assertSafeToRun(env: NodeJS.ProcessEnv = process.env): void {
  const problems: string[] = [];

  if (env.E2E_ALLOW !== '1') {
    problems.push(
      'E2E_ALLOW=1 is not set. This suite creates practices, people and calls in the database named by DATABASE_URL, ' +
        'so it only runs when you say so. Set E2E_ALLOW=1 once you have checked DATABASE_URL points at a test or preview database.',
    );
  }

  const url = env.DATABASE_URL;
  if (!url) {
    problems.push('DATABASE_URL is not set. Put the test database in .env.local (see e2e/README.md).');
  } else {
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      problems.push('DATABASE_URL is not a valid URL.');
    }
    if (host.startsWith(PRODUCTION_HOST_PREFIX)) {
      problems.push(`DATABASE_URL points at the production database (${host}). The e2e suite must never run against production.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`\n\nThe end-to-end suite will not start:\n${problems.map(p => `  - ${p}`).join('\n')}\n`);
  }
}
