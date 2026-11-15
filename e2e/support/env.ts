import path from 'node:path';

/** Settings shared by the Playwright config, the global setup and every spec. */

export const PORT = Number(process.env.E2E_PORT ?? 3232);
export const BASE_URL = `http://localhost:${PORT}`;

/**
 * One id per run, put in every practice name and email this run creates (`e2e-<runid>-...`).
 * Set once, by the Playwright config in the main process; the workers inherit it.
 */
export function runId(): string {
  if (!process.env.E2E_RUN_ID) {
    const random = Math.random().toString(36).slice(2, 5);
    process.env.E2E_RUN_ID = `${Date.now().toString(36).slice(-5)}${random}`.toLowerCase();
  }
  return process.env.E2E_RUN_ID;
}

export const ROOT = path.resolve(__dirname, '..', '..');
export const AUTH_DIR = path.join(ROOT, 'e2e', '.auth');
export const ADMIN_STATE = path.join(AUTH_DIR, 'admin.json');

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See e2e/README.md.`);
  return value;
}

/** The Chromium to use, when the machine's own is not where Playwright looks (see e2e/README.md). */
export const chromiumPath: string | undefined = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
