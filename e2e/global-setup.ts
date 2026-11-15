import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import { ADMIN_STATE, AUTH_DIR, BASE_URL, requiredEnv, runId } from './support/env';
import { assertSafeToRun } from './support/guard';

const isAdminPage = (page: Page) => page.getByRole('heading', { level: 1, name: 'Practices and usage' }).isVisible();

/**
 * Runs once before the specs: refuses to run against production or without E2E_ALLOW=1, then makes
 * sure there is a signed-in platform admin cookie for the specs. A cookie saved by an earlier run is
 * reused while it still works, because sign-ins are throttled per address (30 in 15 minutes) and the
 * suite should not use up more of that than it has to. The admin account is only ever signed in to
 * here; no test changes it or its practice.
 */
export default async function globalSetup(): Promise<void> {
  assertSafeToRun();
  const email = requiredEnv('E2E_ADMIN_EMAIL');
  const password = requiredEnv('E2E_ADMIN_PASSWORD');
  console.log(`e2e run id: ${runId()}`);

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ executablePath });
  try {
    if (fs.existsSync(ADMIN_STATE)) {
      const saved = await browser.newContext({ baseURL: BASE_URL, storageState: ADMIN_STATE });
      const page = await saved.newPage();
      await page.goto('/admin');
      const stillWorks = await isAdminPage(page);
      await saved.close();
      if (stillWorks) return;
    }

    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    try {
      await page.waitForURL(url => url.pathname !== '/sign-in', { timeout: 30_000 });
    } catch {
      throw new Error(
        'The platform admin could not sign in. Check E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD. ' +
          'If they are right, sign-ins from this address may be throttled (30 in 15 minutes): wait 15 minutes and run again.',
      );
    }
    await page.goto('/admin');
    if (!(await isAdminPage(page))) {
      throw new Error(`${email} signed in but is not a platform admin. The suite needs one to create practices.`);
    }
    await context.storageState({ path: ADMIN_STATE });
  } finally {
    await browser.close();
  }
}
