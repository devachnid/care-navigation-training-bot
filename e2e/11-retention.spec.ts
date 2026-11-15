import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { finishCall, makeOldCall } from './support/call';
import { newContextFor, setUpPractice, startCallFromHome, type Practice } from './support/flows';

/**
 * Journey 11: transcript retention, end to end. A practice keeps transcripts for 90 days; a call is
 * made 100 days old (through the support helper, which can give the backend a past time); the daily
 * job's route is called with the secret; the old call's debrief page says the transcript was deleted
 * and still shows the score, while a call made today is untouched.
 *
 * The job deletes every expired transcript in the database it runs against, not only this practice's.
 * That is what it does in production, and it is why this journey is only safe on a test database.
 */

test.describe.configure({ mode: 'serial' });

const OLD_SCORE = 80;
const NEW_SCORE = 70;
const LINE = 'I can book you with the pharmacist today.';

let practice: Practice;
let context: BrowserContext;
let manager: Page;
let oldCallId: string;
let newCallId: string;

test.beforeAll(async ({ browser }) => {
  practice = await setUpPractice(browser, 'retain');
  context = await newContextFor(browser, practice.manager);
  manager = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

test('the practice keeps transcripts for 90 days', async () => {
  await manager.goto('/settings');
  await manager.getByLabel('Keep transcripts for').selectOption('90');
  await expect(manager.getByText('Older transcripts will be deleted')).toBeVisible();
  await manager.getByRole('button', { name: 'Save settings' }).click();
  await expect(manager.getByText('Your settings have been saved.')).toBeVisible();
  await manager.reload();
  await expect(manager.getByLabel('Keep transcripts for')).toHaveValue('90');
});

test('a call 100 days old and a call from today, both with debriefs', async () => {
  oldCallId = await makeOldCall(practice.manager, 100, { score: OLD_SCORE });
  newCallId = await startCallFromHome(manager, 'Sore throat');
  await finishCall(practice.manager, newCallId, { score: NEW_SCORE });

  for (const [id, score] of [
    [oldCallId, OLD_SCORE],
    [newCallId, NEW_SCORE],
  ] as const) {
    await manager.goto(`/debrief/${id}`);
    await expect(manager.getByLabel('Result of this call')).toContainText(`${score}%`);
    await expect(manager.getByText(LINE).first()).toBeVisible();
    await expect(manager.getByText('The transcript has been deleted')).toHaveCount(0);
  }
});

test('the job refuses without its secret, then deletes only the expired transcript', async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  expect(secret, 'CRON_SECRET must be in .env.local (20 or more characters); see e2e/README.md').toBeTruthy();

  const refused = await request.get('/api/cron/retention');
  expect(refused.status()).toBe(401);

  const done = await request.get('/api/cron/retention', { headers: { Authorization: `Bearer ${secret}` } });
  expect(done.status()).toBe(200);
  const body = (await done.json()) as { sessions: number };
  expect(body.sessions).toBeGreaterThanOrEqual(1);
});

test('the old debrief says its transcript was deleted and keeps its score; the new one is untouched', async () => {
  await manager.goto(`/debrief/${oldCallId}`);
  await expect(manager.getByText('The transcript has been deleted')).toBeVisible();
  const result = manager.getByLabel('Result of this call');
  await expect(result).toContainText(`${OLD_SCORE}%`);
  await expect(result).toContainText('Outcome correct');
  await expect(manager.getByText(LINE)).toHaveCount(0);
  await expect(manager.getByRole('button', { name: 'Send report' })).toHaveCount(0);

  await manager.goto(`/debrief/${newCallId}`);
  await expect(manager.getByText('The transcript has been deleted')).toHaveCount(0);
  await expect(manager.getByLabel('Result of this call')).toContainText(`${NEW_SCORE}%`);
  await expect(manager.getByText(LINE).first()).toBeVisible();

  // The change is on the practice's list of recent changes.
  await manager.goto('/settings');
  await expect(manager.getByRole('table', { name: /Recent changes/ })).toContainText(/transcript/i);
});
