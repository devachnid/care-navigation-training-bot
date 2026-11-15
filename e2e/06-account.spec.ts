import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { newContextFor, setUpPractice, signInAs, type Practice } from './support/flows';

/** Journey 6: a person's own account: wrong password, changing it, other sessions, signing out. */

test.describe.configure({ mode: 'serial' });

const NEW_PASSWORD = 'Marble orchard flute 5560';

let practice: Practice;
let here: BrowserContext;
let hereTab: Page;
let elsewhere: BrowserContext;
let elsewhereTab: Page;

test.beforeAll(async ({ browser }) => {
  practice = await setUpPractice(browser, 'acct');
  // Two browsers signed in as the same person: the one that accepted the invitation, and one that signed in.
  here = await newContextFor(browser, practice.manager);
  hereTab = await here.newPage();
  elsewhere = await signInAs(browser, { ...practice.manager });
  elsewhereTab = elsewhere.pages()[0];
});

test.afterAll(async () => {
  await here?.close();
  await elsewhere?.close();
});

test('a wrong password at sign-in is refused with the generic message', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(practice.manager.email);
  await page.getByLabel('Password').fill('Not the right password 1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That email and password do not match an account. Check them and try again.').first()).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
  // What was typed in the email box is kept; the password is not.
  await expect(page.getByLabel('Email address')).toHaveValue(practice.manager.email);
  await expect(page.getByLabel('Password')).toHaveValue('');

  await context.close();
});

test('the account page shows who is signed in, and a wrong current password is refused', async () => {
  await hereTab.goto('/account');
  await expect(hereTab.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();
  await expect(hereTab.getByText(practice.manager.email)).toBeVisible();

  await hereTab.getByLabel('Current password').fill('Not the right password 1234');
  await hereTab.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await hereTab.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await hereTab.getByRole('button', { name: 'Change password' }).click();
  await expect(hereTab.getByText('Your current password is not right.').first()).toBeVisible();
});

test('changing the password signs out the other browser but not this one', async ({ browser }) => {
  await elsewhereTab.goto('/history');
  await expect(elsewhereTab.getByRole('heading', { level: 1, name: 'My calls' })).toBeVisible();

  await hereTab.getByLabel('Current password').fill(practice.manager.password);
  await hereTab.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await hereTab.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await hereTab.getByRole('button', { name: 'Change password' }).click();
  await expect(hereTab.getByText('Your password has been changed. You have been signed out everywhere else.')).toBeVisible();

  // This browser carries on; the other one is sent to sign in.
  await hereTab.goto('/history');
  await expect(hereTab.getByRole('heading', { level: 1, name: 'My calls' })).toBeVisible();
  await elsewhereTab.goto('/history');
  await expect(elsewhereTab).toHaveURL(/\/sign-in$/);

  // The old password no longer signs in; the new one does.
  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(practice.manager.email);
  await page.getByLabel('Password').fill(practice.manager.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That email and password do not match an account.').first()).toBeVisible();
  await page.getByLabel('Password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(url => url.pathname === '/');
  await expect(page.getByRole('heading', { level: 1, name: 'Choose a call' })).toBeVisible();
  await fresh.close();
});

test('signing out ends the session', async ({ browser }) => {
  await hereTab.goto('/');
  const before = await here.storageState();
  await hereTab.getByRole('button', { name: 'Sign out' }).click();
  await expect(hereTab).toHaveURL(/\/sign-in$/);

  // Even the old cookie, if someone kept a copy, no longer works: the session is ended on the server.
  const copy = await browser.newContext({ storageState: before });
  const copyTab = await copy.newPage();
  await copyTab.goto('/history');
  await expect(copyTab).toHaveURL(/\/sign-in$/);
  await copy.close();

  for (const path of ['/', '/account', '/team', '/history']) {
    await hereTab.goto(path);
    await expect(hereTab, `${path} after signing out`).toHaveURL(/\/sign-in$/);
  }
});
