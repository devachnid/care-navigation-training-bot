import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { addTeamMember, inviteFromTeam, namesFor, newContextFor, setUpPractice, type Person, type Practice } from './support/flows';

/**
 * Journey 10: an invitation made by a manager stops working when that manager is demoted or
 * deactivated by another manager. (A link can only be used while whoever made it still manages.)
 */

test.describe.configure({ mode: 'serial' });

const names = namesFor('removed');
const second = names.person('manager', 'second-manager');

let practice: Practice;
let firstContext: BrowserContext;
let secondContext: BrowserContext;
let first: Page;
let secondPage: Page;

async function stranger(browser: Browser, link: string, heading: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await context.close();
}

async function openSecond(): Promise<void> {
  await first.goto('/team');
  await first.getByRole('link', { name: second.name }).click();
  await expect(first.getByRole('heading', { level: 1, name: second.name })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  practice = await setUpPractice(browser, 'removed');
  await addTeamMember(browser, practice, second);
  firstContext = await newContextFor(browser, practice.manager);
  secondContext = await newContextFor(browser, second);
  first = await firstContext.newPage();
  secondPage = await secondContext.newPage();
});

test.afterAll(async () => {
  await firstContext?.close();
  await secondContext?.close();
});

test('an invitation stops working when the manager who made it is demoted', async ({ browser }) => {
  const invited: Person = names.person('trainee', 'invited-one');
  const link = await inviteFromTeam(secondPage, invited);
  await stranger(browser, link, 'Create your account');

  await openSecond();
  await first.getByLabel('Role', { exact: true }).selectOption('trainee');
  await first.getByRole('button', { name: 'Change role' }).click();
  await expect(first.getByText('Done. They are now a trainee.')).toBeVisible();

  await stranger(browser, link, 'This link cannot be used');
  await first.goto('/team');
  await expect(first.getByRole('table', { name: 'Invitations waiting to be used' })).not.toContainText(invited.email);
});

test('an invitation stops working when the manager who made it is deactivated', async ({ browser }) => {
  // Make them a manager again, and let them invite someone new.
  await openSecond();
  await first.getByLabel('Role', { exact: true }).selectOption('manager');
  await first.getByRole('button', { name: 'Change role' }).click();
  await expect(first.getByText('Done. They are now a manager.')).toBeVisible();

  const invited: Person = names.person('trainee', 'invited-two');
  const link = await inviteFromTeam(secondPage, invited);
  await stranger(browser, link, 'Create your account');

  await openSecond();
  await first.getByRole('button', { name: 'Deactivate' }).click();
  await first.getByRole('button', { name: 'Yes, deactivate' }).click();
  await expect(first.getByText('Done. They can no longer sign in to your practice.')).toBeVisible();

  await stranger(browser, link, 'This link cannot be used');
});
