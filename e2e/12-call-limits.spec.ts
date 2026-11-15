import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { endCallTooShort } from './support/call';
import { CALL_STATUS } from '@/app/_lib/labels';
import { newContextFor, setUpPractice, startCallFromHome, type Practice } from './support/flows';

/**
 * Journey 12: the call limits that can be shown without audio. A call that ends within 20 seconds is
 * a fail scoring 0; and once a person has started the day's limit of calls, the next is refused in
 * words. The config starts the server with a low DAILY_CALL_LIMIT (3 unless E2E_DAILY_CALL_LIMIT says
 * otherwise); the person here is the only one who makes that many calls in a day.
 */

test.describe.configure({ mode: 'serial' });

const LIMIT = Number(process.env.DAILY_CALL_LIMIT ?? 3);
const TITLE = 'Sore throat';

let practice: Practice;
let context: BrowserContext;
let page: Page;
let firstCallId: string;

test.beforeAll(async ({ browser }) => {
  practice = await setUpPractice(browser, 'limits');
  context = await newContextFor(browser, practice.manager);
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

test('a call that is too short shows as a fail scoring 0', async () => {
  firstCallId = await startCallFromHome(page, TITLE);
  await endCallTooShort(practice.manager, firstCallId);

  await page.goto('/history');
  const row = page.getByRole('table', { name: 'Your calls, newest first' }).getByRole('row', { name: new RegExp(TITLE) });
  await expect(row).toContainText(CALL_STATUS.too_short);
  await expect(row).toContainText('0%');

  await page.goto(`/debrief/${firstCallId}`);
  await expect(page.getByText('Fail. Score 0.')).toBeVisible();
  await expect(page.getByText('under 20 seconds', { exact: false })).toBeVisible();
  // There is no result to report a problem with.
  await expect(page.getByRole('button', { name: 'Send report' })).toHaveCount(0);
});

test('the call after the daily limit is refused with the reason, and nothing is started', async () => {
  // The first call counts: start the rest of the day's calls.
  for (let n = 2; n <= LIMIT; n++) await startCallFromHome(page, TITLE);

  await page.goto('/');
  await page.getByRole('button', { name: `Start the call ${TITLE}` }).click();
  await expect(page.getByText('No more calls today')).toBeVisible();
  await expect(page.getByText(/daily limit/)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  // "Try this call" on the scenarios page counts as a call too, and is refused the same way.
  await page.goto('/scenarios');
  await page.getByRole('link', { name: TITLE, exact: true }).click();
  await page.getByRole('button', { name: 'Try this call' }).click();
  await expect(page.getByText(/daily limit/)).toBeVisible();
  await expect(page).toHaveURL(/\/scenarios\//);

  // Exactly the limit's worth of calls were made.
  await page.goto('/history');
  await expect(page.getByRole('table', { name: 'Your calls, newest first' }).getByRole('row')).toHaveCount(LIMIT + 1);
});
