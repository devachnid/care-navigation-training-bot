import { expect, test } from '@playwright/test';
import { addPractice, acceptInvitation, inviteManager, namesFor, newAdminContext, newContextFor } from './support/flows';

/** Journey 1: the admin sets up a practice and its first manager joins. */

const names = namesFor('setup');
const practiceName = names.practiceName();
const manager = names.person('manager');

test('an admin adds a practice and the manager it invites joins it', async ({ browser }) => {
  const adminContext = await newAdminContext(browser);
  const admin = await adminContext.newPage();

  // The admin adds the practice. It appears in the list and starts with the library scenarios as drafts.
  const practiceId = await addPractice(admin, practiceName);
  await admin.goto('/admin');
  await expect(admin.getByRole('link', { name: practiceName })).toBeVisible();

  // The admin invites the manager. The link is shown, once.
  const link = await inviteManager(admin, practiceId, manager);
  expect(link).toMatch(new RegExp(`^http://localhost:\\d+/invite/[A-Za-z0-9_-]{20,}$`));
  await expect(admin.getByText('We do not send it, and we will not show it again.')).toBeVisible();
  await admin.reload();
  await expect(admin.getByRole('textbox', { name: /Invitation link/ })).toHaveCount(0);
  await expect(admin.getByRole('table', { name: 'Manager invitations waiting to be used' })).toContainText(manager.email);

  // The manager accepts in a fresh browser and lands on their own home page, in their own practice.
  const managerContext = await acceptInvitation(browser, link, manager);
  const page = managerContext.pages()[0];
  await expect(page.getByRole('heading', { level: 1, name: 'Choose a call' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(practiceName);
  await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('Team');
  await expect(page.getByRole('navigation', { name: 'Main' })).not.toContainText('Admin');

  // The used link no longer works, for anyone.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(link);
  await expect(strangerPage.getByRole('heading', { level: 1, name: 'This link cannot be used' })).toBeVisible();
  await expect(strangerPage.getByLabel('Choose a password')).toHaveCount(0);

  // The admin's page now lists the manager as a person, and nobody waiting.
  await admin.goto(`/admin/practices/${practiceId}`);
  await expect(admin.getByRole('table', { name: 'Manager invitations waiting to be used' })).toContainText('Nobody is waiting to join.');
  await expect(admin.getByRole('table').filter({ hasText: manager.email })).toBeVisible();

  // The manager signs in again with the password they chose.
  const again = await newContextFor(browser, manager);
  const againPage = await again.newPage();
  await againPage.goto('/team');
  await expect(againPage.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible();

  await Promise.all([strangerPage.close(), stranger.close(), again.close(), managerContext.close(), adminContext.close()]);
});

test('a manager link for a practice can be cancelled by the admin', async ({ browser }) => {
  const other = namesFor('setup-revoke');
  const cancelled = other.person('manager');
  const adminContext = await newAdminContext(browser);
  const admin = await adminContext.newPage();
  const practiceId = await addPractice(admin, other.practiceName());
  const link = await inviteManager(admin, practiceId, cancelled);

  await admin.getByRole('button', { name: 'Revoke' }).click();
  await admin.getByRole('button', { name: 'Yes, revoke' }).click();
  await expect(admin.getByRole('table', { name: 'Manager invitations waiting to be used' })).toContainText('Nobody is waiting to join.');

  const stranger = await browser.newContext();
  const page = await stranger.newPage();
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'This link cannot be used' })).toBeVisible();
  await stranger.close();
  await adminContext.close();
});
