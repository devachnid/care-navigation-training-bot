import { execFile } from 'node:child_process';
import { ROOT } from './env';
import type { Person } from './flows';

export type FinishedCallOptions = {
  score?: number;
  outcomeCorrect?: boolean;
  unsafeOutcome?: boolean;
  durationSeconds?: number;
};

/**
 * Connects, ends and debriefs a call the person has already started in the browser. This is the one
 * thing the UI cannot do without a microphone and the debrief model; see call-helper.ts.
 */
export function finishCall(person: Person, sessionId: string, options: FinishedCallOptions = {}): Promise<void> {
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
          E2E_HELPER_EMAIL: person.email,
          E2E_HELPER_PASSWORD: person.password,
          E2E_HELPER_SESSION_ID: sessionId,
          E2E_HELPER_OPTIONS: JSON.stringify(options),
        },
      },
      (error, stdout, stderr) => {
        const last = stdout.trim().split('\n').pop() ?? '';
        if (error) reject(new Error(`call helper failed: ${last || stderr || error.message}`));
        else resolve();
      },
    );
  });
}
