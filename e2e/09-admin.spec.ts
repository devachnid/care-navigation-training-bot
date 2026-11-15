import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { addTeamMember, namesFor, newAdminContext, newContextFor, readLink, setUpPractice, type Practice } from './support/flows';

/**
 * Journey 9: the platform admin looks after a practice. Suspending it stops its manager (still signed
 * in) using it; resuming gives it back; the admin can make a reset link for one of its people, and once
 * the link is used the practice's manager can see both entries about the service administrator.
 */

test.describe.configure({ mode: 'serial' });

const names = namesFor('admin');
const trainee = names.person('trainee', 'trainee');
const NEW_PASSWORD = 'Willow anchor bakery 3381';

let practice: Practice;
let adminContext: BrowserContext;
let admin: Page;
let managerContext: BrowserContext;
let manager: Page;

test.beforeAll(async ({ browser }) => {
  practice = await setUpPractice(browser, 'admin');
  await addTeamMember(browser, practice, trainee);
  adminContext = await newAdminContext(browser);
  admin = await adminContext.newPage();
  managerContext = await newContextFor(browser, practice.manager);
  manager = await managerContext.newPage();
});

test.afterAll(async () => {
  await adminContext?.close();
  await managerContext?.close();
});

test('suspending a practice stops its signed-in manager using it, and resuming gives it back', async () => {
  await manager.goto('/team');
  await expect(manager.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible();

  await admin.goto(`/admin/practices/${practice.id}`);
  await admin.getByRole('button', { name: 'Suspend this practice' }).click();
  await admin.getByRole('button', { name: 'Yes, suspend' }).click();
  await expect(admin.getByText('This practice is suspended')).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Resume this practice' })).toBeVisible();
  await admin.goto('/admin');
  await expect(admin.getByRole('row', { name: new RegExp(practice.name) })).toContainText('Suspended');

  // Their open browser is turned away on the next page.
  await manager.goto('/team');
  await expect(manager).toHaveURL(/\/no-access$/);
  await manager.goto('/');
  await expect(manager).toHaveURL(/\/no-access$/);

  await admin.goto(`/admin/practices/${practice.id}`);
  await admin.getByRole('button', { name: 'Resume this practice' }).click();
  await admin.getByRole('button', { name: 'Yes, resume' }).click();
  await expect(admin.getByRole('button', { name: 'Suspend this practice' })).toBeVisible();

  await manager.goto('/team');
  await expect(manager.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible();
});

test('the admin makes a reset link for one of its people; the manager sees both entries in Recent changes', async ({ browser }) => {
  await admin.goto(`/admin/practices/${practice.id}`);
  await admin.getByRole('button', { name: `Create a password reset link for ${trainee.name}` }).click();
  const link = await readLink(admin, /Password reset link/);

  const person = await browser.newContext();
  const page = await person.newPage();
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await page.waitForURL(url => url.pathname === '/');
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'This link cannot be used' })).toBeVisible();
  await person.close();

  await manager.goto('/settings');
  const changes = manager.getByRole('table', { name: /Recent changes/ });
  await expect(changes).toContainText(`The service administrator created a password reset link for ${trainee.name}`);
  await expect(changes).toContainText(`${trainee.name} set a new password using a link from the service administrator`);
});
