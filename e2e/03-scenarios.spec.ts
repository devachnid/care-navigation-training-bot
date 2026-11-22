import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { addTeamMember, namesFor, newContextFor, scenarioIdByTitle, setUpPractice, type Practice } from './support/flows';

/** Journey 3: scenarios start as drafts; only a clinician approves; staff see only what is approved and shown. */

test.describe.configure({ mode: 'serial' });

const names = namesFor('scen');
const trainee = names.person('trainee', 'trainee');
const clinician = names.person('clinician', 'clinician');
const TITLE = 'Sore throat';

let practice: Practice;
let scenarioId: string;
let contexts: BrowserContext[] = [];
let manager: Page;
let traineePage: Page;
let clinicianPage: Page;

/** What the trainee's home page offers: the titles on its "Start the call" buttons. */
async function traineeSees(page: Page): Promise<string[]> {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Choose a call' })).toBeVisible();
  const buttons = await page.getByRole('button', { name: /^Start the call/ }).allTextContents();
  return buttons.map(t => t.replace(/^Start the call\s*/, '').trim()).sort();
}

test.beforeAll(async ({ browser }) => {
  practice = await setUpPractice(browser, 'scen');
  await addTeamMember(browser, practice, trainee);
  await addTeamMember(browser, practice, clinician);
  contexts = await Promise.all([practice.manager, trainee, clinician].map(p => newContextFor(browser, p)));
  [manager, traineePage, clinicianPage] = await Promise.all(contexts.map(c => c.newPage()));
  scenarioId = await scenarioIdByTitle(manager, TITLE);
});

test.afterAll(async () => {
  await Promise.all(contexts.map(c => c.close()));
});

test('a new practice has the library scenarios as drafts, and the trainee sees none', async () => {
  await manager.goto('/scenarios');
  const table = manager.getByRole('table', { name: 'Your practice’s scenarios' });
  await expect(table.getByRole('row')).toHaveCount(5); // header and four scenarios
  await expect(table.getByText('Draft', { exact: true })).toHaveCount(4);
  await expect(table.getByText('Approved', { exact: true })).toHaveCount(0);

  expect(await traineeSees(traineePage)).toEqual([]);
  await expect(traineePage.getByText('There are no calls to practise yet')).toBeVisible();
});

test('the manager cannot approve; the clinician can', async () => {
  await manager.goto(`/scenarios/${scenarioId}`);
  await expect(manager.getByText('You cannot approve scenarios')).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Approve this scenario' })).toHaveCount(0);

  await clinicianPage.goto(`/scenarios/${scenarioId}`);
  // Refused without the tick, in words beside the box.
  await clinicianPage.getByRole('button', { name: 'Approve this scenario' }).click();
  await expect(clinicianPage.getByText('Tick the box to say you have checked this scenario').first()).toBeVisible();
  await clinicianPage.getByLabel(/I have checked this scenario/).check();
  await clinicianPage.getByRole('button', { name: 'Approve this scenario' }).click();
  await expect(clinicianPage.getByText(new RegExp(`^Approved by ${clinician.name}`))).toBeVisible();

  await manager.goto('/scenarios');
  const table = manager.getByRole('table', { name: 'Your practice’s scenarios' });
  await expect(table.getByRole('row', { name: new RegExp(TITLE) })).toContainText('Approved');
  await expect(table.getByText('Approved', { exact: true })).toHaveCount(1);
});

test('the trainee now sees exactly the approved scenario', async () => {
  expect(await traineeSees(traineePage)).toEqual([TITLE]);
  await expect(traineePage.getByText('Draft', { exact: true })).toHaveCount(0);
});

test('editing an approved scenario makes it a draft again and hides it from the trainee', async () => {
  await manager.goto(`/scenarios/${scenarioId}`);
  await expect(manager.getByText('This scenario is approved')).toBeVisible();
  const opening = manager.getByLabel('Opening line');
  await opening.fill(`${await opening.inputValue()} Sorry to bother you.`);
  await manager.getByRole('button', { name: 'Save changes' }).click();
  await expect(manager.getByText('Your changes are saved.')).toBeVisible();

  await manager.goto('/scenarios');
  const row = manager.getByRole('table', { name: 'Your practice’s scenarios' }).getByRole('row', { name: new RegExp(TITLE) });
  await expect(row).toContainText('Changed since approval');
  expect(await traineeSees(traineePage)).toEqual([]);
});

test('the clinician approves the new version; hiding and showing it changes what the trainee sees', async () => {
  await clinicianPage.goto(`/scenarios/${scenarioId}`);
  await clinicianPage.getByLabel(/I have checked this scenario/).check();
  await clinicianPage.getByRole('button', { name: 'Approve this scenario' }).click();
  await expect(clinicianPage.getByText(new RegExp(`^Approved by ${clinician.name}`))).toBeVisible();
  expect(await traineeSees(traineePage)).toEqual([TITLE]);

  await manager.goto(`/scenarios/${scenarioId}`);
  await manager.getByRole('button', { name: 'Hide from staff' }).click();
  await expect(manager.getByRole('button', { name: 'Show to staff' })).toBeVisible();
  expect(await traineeSees(traineePage)).toEqual([]);

  await manager.getByRole('button', { name: 'Show to staff' }).click();
  await expect(manager.getByRole('button', { name: 'Hide from staff' })).toBeVisible();
  expect(await traineeSees(traineePage)).toEqual([TITLE]);
});

test('allowing drafts shows the trainee every shown scenario, the unapproved ones labelled as drafts', async () => {
  await manager.goto('/settings');
  await manager.getByLabel('Let staff practise on draft scenarios').check();
  await manager.getByRole('button', { name: 'Save settings' }).click();
  await expect(manager.getByText('Your settings have been saved.')).toBeVisible();

  const seen = await traineeSees(traineePage);
  expect(seen).toHaveLength(4);
  expect(seen).toContain(TITLE);
  const cards = traineePage.getByRole('listitem').filter({ has: traineePage.getByRole('button', { name: /^Start the call/ }) });
  await expect(cards).toHaveCount(4);
  await expect(cards.getByText('Draft', { exact: true })).toHaveCount(3);
  await expect(cards.filter({ hasText: TITLE }).getByText('Draft', { exact: true })).toHaveCount(0);
  await expect(traineePage.getByText(/No clinician has approved this scenario yet/).first()).toBeVisible();

  // Turned off again, the trainee is back to the one approved scenario.
  await manager.getByLabel('Let staff practise on draft scenarios').uncheck();
  await manager.getByRole('button', { name: 'Save settings' }).click();
  // The first save's message is still on the page, so wait for what the trainee sees rather than for the message.
  await expect.poll(() => traineeSees(traineePage)).toEqual([TITLE]);
});
