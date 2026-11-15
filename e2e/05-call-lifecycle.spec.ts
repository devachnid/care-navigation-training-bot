import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { CALL_STATUS, LATEST_RESULT } from '@/app/_lib/labels';
import { finishCall } from './support/call';
import { csvRecords } from './support/csv';
import {
  addTeamMember,
  namesFor,
  newContextFor,
  scenarioIdByTitle,
  setUpPractice,
  startCallFromHome,
  type Practice,
} from './support/flows';

/**
 * Journey 5: a call's life without audio. The trainee starts the call in the browser; the call is
 * then connected, ended and debriefed by the backend functions (see support/call-helper.ts), because
 * there is no microphone and no debrief model here. Everything else is done through the pages.
 */

test.describe.configure({ mode: 'serial' });

const names = namesFor('call');
const trainee = names.person('trainee', 'trainee');
const clinician = names.person('clinician', 'clinician');
const TITLE = 'Sore throat';

let practice: Practice;
let otherPractice: Practice;
let scenarioId: string;
let sessionId: string;
let contexts: BrowserContext[] = [];
let manager: Page;
let traineePage: Page;
let otherManager: Page;

test.beforeAll(async ({ browser }) => {
  practice = await setUpPractice(browser, 'call');
  await addTeamMember(browser, practice, trainee);
  await addTeamMember(browser, practice, clinician);
  otherPractice = await setUpPractice(browser, 'call-other');
  contexts = await Promise.all([practice.manager, trainee, clinician, otherPractice.manager].map(p => newContextFor(browser, p)));
  const [managerPage, tPage, clinicianPage, oPage] = await Promise.all(contexts.map(c => c.newPage()));
  manager = managerPage;
  traineePage = tPage;
  otherManager = oPage;

  // The clinician approves the scenario the trainee will call.
  scenarioId = await scenarioIdByTitle(manager, TITLE);
  await clinicianPage.goto(`/scenarios/${scenarioId}`);
  await clinicianPage.getByLabel(/I have checked this scenario/).check();
  await clinicianPage.getByRole('button', { name: 'Approve this scenario' }).click();
  await expect(clinicianPage.getByText(new RegExp(`^Approved by ${clinician.name}`))).toBeVisible();
});

test.afterAll(async () => {
  await Promise.all(contexts.map(c => c.close()));
});

test('the trainee starts a call and reaches the call screen, which holds no answer key', async () => {
  // What the manager knows and the trainee must not: the answer key, read from the manager's scenario page.
  await manager.goto(`/scenarios/${scenarioId}`);
  const answerKey = await manager.locator('textarea[name="correctOutcome"]').inputValue();
  expect(answerKey.length).toBeGreaterThan(30);

  sessionId = await startCallFromHome(traineePage, TITLE);
  await expect(traineePage.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(traineePage.getByRole('button', { name: 'Start the call' })).toBeVisible();

  // The page as the server sent it (the text of the page and the data it hands to the browser), not only what is drawn.
  const html = await (await traineePage.request.get(`/call/${sessionId}`)).text();
  expect(html).toContain('Start the call');
  for (const secret of [answerKey, 'Community pharmacy', 'Common Ailments Scheme', 'sore throat test and treat']) {
    expect(html, `the call page must not contain: ${secret}`).not.toContain(secret);
  }
  const rendered = await traineePage.content();
  expect(rendered).not.toContain('Common Ailments Scheme');
});

test('the call is connected, ended and debriefed; the trainee sees it in My calls and on the debrief page', async () => {
  await finishCall(trainee, sessionId, { score: 85, outcomeCorrect: true, durationSeconds: 150 });

  // A finished call cannot be taken again: the call address now shows what happened.
  await traineePage.goto(`/call/${sessionId}`);
  await expect(traineePage).toHaveURL(new RegExp(`/debrief/${sessionId}$`));

  await traineePage.goto('/history');
  const row = traineePage.getByRole('table', { name: 'Your calls, newest first' }).getByRole('row', { name: new RegExp(TITLE) });
  await expect(row).toContainText(CALL_STATUS.complete);
  await expect(row).toContainText('85%');
  await expect(row).toContainText('2:30');
  await row.getByRole('link', { name: TITLE }).click();

  await expect(traineePage).toHaveURL(new RegExp(`/debrief/${sessionId}$`));
  await expect(traineePage.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  const result = traineePage.getByLabel('Result of this call');
  await expect(result).toContainText('85%');
  await expect(result).toContainText('Outcome correct');
  await expect(result).toContainText('Yes');
  await expect(traineePage.getByRole('table', { name: 'Score for each area' })).toContainText('Greeting and identification');
  await expect(traineePage.getByText('I can book you with the pharmacist today.').first()).toBeVisible();
  // Only the trainee's own side is "You"; the caller is "Caller".
  await expect(traineePage.getByRole('list').filter({ hasText: 'Caller' }).first()).toBeVisible();
});

test('the home page shows the trainee their progress', async () => {
  await traineePage.goto('/');
  const card = traineePage.getByRole('listitem').filter({ has: traineePage.getByRole('button', { name: /^Start the call/ }) }).filter({ hasText: TITLE });
  const progress = card.getByLabel(`Your progress on ${TITLE}`);
  await expect(progress).toContainText('Calls made');
  await expect(progress).toContainText('1');
  await expect(progress).toContainText('85%');
  await expect(progress).toContainText(LATEST_RESULT.passed.label);
});

test('the trainee reports a problem with the debrief', async () => {
  await traineePage.goto(`/debrief/${sessionId}`);
  await traineePage.getByRole('button', { name: 'Send report' }).click();
  await expect(traineePage.getByText('Say what is wrong with the debrief.').first()).toBeVisible();
  await traineePage.getByLabel('What is wrong with this debrief?').fill('The score looks too low for how well I did.');
  await traineePage.getByRole('button', { name: 'Send report' }).click();
  await expect(traineePage.getByText('You reported a problem with this debrief')).toBeVisible();
  await expect(traineePage.getByText('A manager will look at it.')).toBeVisible();
});

test('the manager sees the call on the person’s page, in reports, and in the CSV', async () => {
  // The person's page.
  await manager.goto(`/team/${trainee.userId}`);
  const calls = manager.getByRole('table', { name: new RegExp(`${trainee.name}.s calls, newest first`) });
  await expect(calls.getByRole('row', { name: new RegExp(TITLE) })).toContainText('85%');
  await expect(manager.getByRole('table', { name: new RegExp('progress by scenario') })).toContainText(TITLE);
  await manager.goto('/team');
  const teamRow = manager.getByRole('table', { name: 'Staff in your practice, with their calls' }).getByRole('row', { name: new RegExp(trainee.email) });
  await expect(teamRow).toContainText('85%');

  // Reports: the numbers and the who-has-done-what grid.
  await manager.goto('/reports?period=all');
  const summary = manager.getByLabel(/^Summary/);
  await expect(summary.getByText('Calls taken').locator('..')).toHaveText(/^Calls taken\s*1$/);
  await expect(summary).toContainText(/1 of \d+/);
  await expect(summary).toContainText('85%');
  await expect(summary.getByText('Unsafe outcomes').locator('..')).toHaveText(/^Unsafe outcomes\s*0$/);
  const grid = manager.getByRole('table', { name: /^Latest result for each person and scenario/ });
  const traineeRow = grid.getByRole('row', { name: new RegExp(trainee.name) });
  await expect(traineeRow).toContainText(LATEST_RESULT.passed.label);
  await expect(traineeRow).toContainText('Best 85%');
  await expect(traineeRow.getByText('Not tried')).toHaveCount(3);
  const clinicianRow = grid.getByRole('row', { name: new RegExp(clinician.name) });
  await expect(clinicianRow.getByText('Not tried')).toHaveCount(4);
  const byScenario = manager.getByRole('table', { name: /^Results for each scenario/ });
  await expect(byScenario.getByRole('row', { name: new RegExp(TITLE) })).toContainText('85%');

  // The CSV, parsed.
  const response = await manager.request.get('/reports/export?period=all');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/csv');
  expect(response.headers()['content-disposition']).toContain('attachment');
  const records = csvRecords(await response.text());
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    Name: trainee.name,
    Email: trainee.email,
    Scenario: TITLE,
    Difficulty: 'Easy',
    'Draft scenario': 'No',
    'Length (seconds)': '150',
    Result: 'Passed',
    Score: '85',
    'Outcome correct': 'Yes',
    'Unsafe outcome': 'No',
  });
  expect(records[0]['Date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(records[0]['Time (Europe/London)']).toMatch(/^\d{2}:\d{2}$/);
});

test('the manager marks the reported problem as dealt with, and the trainee is told', async () => {
  await manager.goto('/reports?period=all');
  const flags = manager.getByRole('table', { name: /^Debrief problems that nobody has dealt with yet/ });
  await expect(flags).toContainText('The score looks too low for how well I did.');
  await expect(flags).toContainText(trainee.name);
  await flags.getByRole('button', { name: /Mark as dealt with/ }).click();
  await expect(manager.getByRole('table', { name: /^Debrief problems/ })).toHaveCount(0);

  await traineePage.goto(`/debrief/${sessionId}`);
  await expect(traineePage.getByText('A manager has dealt with your report.')).toBeVisible();
});

test('a manager of another practice sees none of it', async () => {
  await otherManager.goto('/reports?period=all');
  await expect(otherManager.getByRole('heading', { name: 'No calls yet' })).toBeVisible();
  await expect(otherManager.getByText(TITLE, { exact: true })).toHaveCount(0);
  await expect(otherManager.getByText(trainee.name)).toHaveCount(0);

  await otherManager.goto('/team');
  await expect(otherManager.getByText(trainee.name)).toHaveCount(0);
  await expect(otherManager.getByText(trainee.email)).toHaveCount(0);
  await otherManager.goto('/history');
  await expect(otherManager.getByRole('heading', { name: 'You have not made any calls yet' })).toBeVisible();

  expect((await otherManager.request.get(`/debrief/${sessionId}`)).status()).toBe(404);
  expect((await otherManager.request.get(`/team/${trainee.userId}`)).status()).toBe(404);
  expect((await otherManager.request.get(`/scenarios/${scenarioId}`)).status()).toBe(404);

  const csv = await otherManager.request.get('/reports/export?period=all');
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(csvRecords(text)).toHaveLength(0);
  expect(text).not.toContain(trainee.email);
});
