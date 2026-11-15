import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, PORT, runId } from './e2e/support/env';
import { assertSafeToRun } from './e2e/support/guard';

// The database URL comes from .env.local, like the app itself. Variables already set win.
dotenv.config({ path: path.resolve(__dirname, '.env.local'), quiet: true });

// Refuse here as well as in the global setup: the web server below is started (and the app built)
// before the global setup runs, and nothing should be built for a run that is going to be refused.
assertSafeToRun();
runId();

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  // Every spec file creates its own practice, so files run side by side. Tests inside a file run in order.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 4),
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 900 },
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    // Off by default. Turn on for a failing run with: npx playwright test --trace on
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    // Never `npm run build`: that runs the database migrations.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/sign-in`,
    reuseExistingServer: true,
    timeout: 600_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { NODE_USE_ENV_PROXY: '1', NEXT_TELEMETRY_DISABLED: '1' },
  },
});
