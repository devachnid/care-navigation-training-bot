import { execFile } from 'node:child_process';
import { ROOT } from './env';
import type { Person } from './flows';

export type FinishedCallOptions = {
  score?: number;
  outcomeCorrect?: boolean;
  unsafeOutcome?: boolean;
  durationSeconds?: number;
};

function runHelper(person: Person, mode: string, env: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', '--env-file=.env.local', 'e2e/support/call-helper.ts'],
      {
        cwd: ROOT,
        timeout: 90_000,
        env: {
          ...process.env,
          NODE_USE_ENV_PROXY: '1',
          NODE_NO_WARNINGS: '1',
          E2E_HELPER_EMAIL: person.email,
          E2E_HELPER_PASSWORD: person.password,
          E2E_HELPER_MODE: mode,
          ...env,
        },
      },
      (error, stdout, stderr) => {
        const last = stdout.trim().split('\n').pop() ?? '';
        if (error) return reject(new Error(`call helper failed: ${last || stderr || error.message}`));
        resolve(JSON.parse(last).sessionId as string);
      },
    );
  });
}

/**
 * Connects, ends and debriefs a call the person has already started in the browser. This is the one
 * thing the UI cannot do without a microphone and the debrief model; see call-helper.ts.
 */
export async function finishCall(person: Person, sessionId: string, options: FinishedCallOptions = {}): Promise<void> {
  await runHelper(person, 'finish', { E2E_HELPER_SESSION_ID: sessionId, E2E_HELPER_OPTIONS: JSON.stringify(options) });
}

/** Connects a call started in the browser and ends it after a few seconds: a fail scoring 0, no debrief. */
export async function endCallTooShort(person: Person, sessionId: string): Promise<void> {
  await runHelper(person, 'too-short', { E2E_HELPER_SESSION_ID: sessionId });
}

/** Makes a finished, debriefed call as if it had been made `daysAgo` days ago. Returns its id. */
export function makeOldCall(person: Person, daysAgo: number, options: FinishedCallOptions & { scenarioTitle?: string } = {}): Promise<string> {
  return runHelper(person, 'old', { E2E_HELPER_OPTIONS: JSON.stringify({ ...options, daysAgo }) });
}
