import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  addTeamMember,
  inviteFromTeam,
  namesFor,
  newContextFor,
  readLink,
  setUpPractice,
  signInAs,
  type Person,
  type Practice,
} from './support/flows';

/** Journey 2: a manager builds and runs the team. The tests run in order and share one practice. */

test.describe.configure({ mode: 'serial' });

const names = namesFor('team');
const trainee = names.person('trainee', 'trainee');
const clinician = names.person('clinician', 'clinician');

let practice: Practice;
let managerContext: BrowserContext;
let manager: Page;

async function openPerson(page: Page, person: Person): Promise<void> {
  await page.goto('/team');
  await page.getByRole('link', { name: person.name }).click();
  await expect(page.getByRole('heading', { level: 1, name: person.name })).toBeVisible();
}

const teamRow = (page: Page, person: Person) => page.getByRole('table', { name: 'Staff in your practice, with their calls' }).getByRole('row', { name: new RegExp(person.email) });

test.beforeAll(async ({ browser }) => {
  practice = await setUpPractice(browser, 'team');
  managerContext = await newContextFor(browser, practice.manager);
  manager = await managerContext.newPage();
});

test.afterAll(async () => {
  await managerContext?.close();
});

test('the manager invites a trainee and a clinician, and both join', async ({ browser }) => {
  await addTeamMember(browser, practice, trainee);
  await addTeamMember(browser, practice, clinician);

  await manager.goto('/team');
  const people = manager.getByRole('table', { name: 'Staff in your practice, with their calls' });
  await expect(people).toContainText(trainee.name);
  await expect(people).toContainText(clinician.name);
  await expect(teamRow(manager, clinician)).toContainText('Approver');
  await expect(teamRow(manager, trainee)).not.toContainText('Approver');
  await expect(teamRow(manager, clinician)).toContainText('Trainee');
  await expect(manager.getByRole('table', { name: 'Invitations waiting to be used' })).toContainText('Nobody is waiting to join.');
});

test('the manager changes a role and the approver switch, and the page shows it at once', async () => {
  await openPerson(manager, trainee);

  await manager.getByLabel('Role', { exact: true }).selectOption('manager');
  await manager.getByRole('button', { name: 'Change role' }).click();
  await expect(manager.getByText('Done. They are now a manager.')).toBeVisible();
  await manager.goto('/team');
  await expect(teamRow(manager, trainee)).toContainText('Manager');

  await openPerson(manager, trainee);
  await manager.getByLabel('Role', { exact: true }).selectOption('trainee');
  await manager.getByRole('button', { name: 'Change role' }).click();
  await expect(manager.getByText('Done. They are now a trainee.')).toBeVisible();

  await manager.getByRole('button', { name: 'Let them approve scenarios' }).click();
  await expect(manager.getByText('Done. They can now approve scenarios.')).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Stop them approving scenarios' })).toBeVisible();
  await manager.goto('/team');
  await expect(teamRow(manager, trainee)).toContainText('Approver');

  await openPerson(manager, trainee);
  await manager.getByRole('button', { name: 'Stop them approving scenarios' }).click();
  await expect(manager.getByText('Done. They can no longer approve scenarios.')).toBeVisible();
  await manager.goto('/team');
  await expect(teamRow(manager, trainee)).not.toContainText('Approver');
});

test('a deactivated person can no longer use the practice, and can again once reactivated', async ({ browser }) => {
  const traineeContext = await newContextFor(browser, trainee);
  const own = await traineeContext.newPage();
  await own.goto('/');
  await expect(own.getByRole('heading', { level: 1, name: 'Choose a call' })).toBeVisible();

  await openPerson(manager, trainee);
  await manager.getByRole('button', { name: 'Deactivate' }).click();
  await manager.getByRole('button', { name: 'Yes, deactivate' }).click();
  await expect(manager.getByText('Done. They can no longer sign in to your practice.')).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Reactivate' })).toBeVisible();
  await manager.goto('/team');
  await expect(teamRow(manager, trainee)).toContainText('Deactivated');

  // Their open browser is turned away on the next page. (Signing in again is not tried here: sign-ins are throttled per address, see the README.)
  await own.goto('/');
  await expect(own).toHaveURL(/\/no-access$/);
  await expect(own.getByRole('heading', { level: 1, name: 'You cannot use a practice at the moment' })).toBeVisible();
  await own.goto('/history');
  await expect(own).toHaveURL(/\/no-access$/);

  await openPerson(manager, trainee);
  await manager.getByRole('button', { name: 'Reactivate' }).click();
  await expect(manager.getByText('Done. They can sign in to your practice again.')).toBeVisible();

  await own.goto('/');
  await expect(own.getByRole('heading', { level: 1, name: 'Choose a call' })).toBeVisible();
  await traineeContext.close();
});

test('a reset link sets a new password and the old one stops working', async ({ browser }) => {
  const newPassword = 'Walnut harbour sketch 9032';
  await openPerson(manager, trainee);
  await manager.getByRole('button', { name: 'Create a password reset link' }).click();
  const link = await readLink(manager, 'Password reset link');

  const resetContext = await browser.newContext();
  const page = await resetContext.newPage();
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm password').fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await page.waitForURL(url => url.pathname === '/');
  await expect(page.getByRole('heading', { level: 1, name: 'Choose a call' })).toBeVisible();

  // The link is spent.
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'This link cannot be used' })).toBeVisible();
  await resetContext.close();

  // The old password is refused, with the one generic message; the new one works.
  const refused = await browser.newContext();
  const signIn = await refused.newPage();
  await signIn.goto('/sign-in');
  await signIn.getByLabel('Email address').fill(trainee.email);
  await signIn.getByLabel('Password').fill(trainee.password);
  await signIn.getByRole('button', { name: 'Sign in' }).click();
  await expect(signIn.getByText('That email and password do not match an account.')).toBeVisible();
  await expect(signIn).toHaveURL(/\/sign-in$/);
  await refused.close();

  trainee.password = newPassword;
  const worked = await signInAs(browser, trainee);
  await expect(worked.pages()[0].getByRole('heading', { level: 1, name: 'Choose a call' })).toBeVisible();
  await worked.close();
});

test('the manager can revoke an invitation, and the link stops working', async ({ browser }) => {
  const invited = names.person('trainee', 'invited');
  const link = await inviteFromTeam(manager, invited);
  await manager.goto('/team');
  const waiting = manager.getByRole('table', { name: 'Invitations waiting to be used' });
  await expect(waiting).toContainText(invited.email);

  const row = waiting.getByRole('row', { name: new RegExp(invited.email) });
  await row.getByRole('button', { name: 'Cancel invitation' }).click();
  await manager.getByRole('button', { name: 'Yes, cancel it' }).click();
  // The row goes once the change has been made (do not leave the page before then).
  await expect(row).toHaveCount(0);
  await manager.goto('/team');
  await expect(manager.getByRole('table', { name: 'Invitations waiting to be used' })).toContainText('Nobody is waiting to join.');

  const stranger = await browser.newContext();
  const page = await stranger.newPage();
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'This link cannot be used' })).toBeVisible();
  await stranger.close();
});

test('an invitation for an email that is already in the practice is refused in words', async () => {
  await manager.goto('/team');
  const form = manager.locator('form', { has: manager.getByRole('button', { name: 'Make an invitation link' }) });
  await form.getByLabel('Name', { exact: true }).fill(clinician.name);
  await form.getByLabel('Work email').fill(clinician.email);
  await form.getByRole('button', { name: 'Make an invitation link' }).click();
  await expect(manager.getByText('That person is already in your practice.').first()).toBeVisible();
  // What the manager typed is still there.
  await expect(form.getByLabel('Work email')).toHaveValue(clinician.email);
});
