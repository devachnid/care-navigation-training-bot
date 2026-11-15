import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { addTeamMember, inviteFromTeam, namesFor, newContextFor, setUpPractice, startCallFromHome, type Practice } from './support/flows';

/**
 * Journey 8: someone who already has an account joins a second practice. The invitation page asks
 * for that account's current password; a wrong one is refused and the link still works; the right
 * one joins. The person can then switch practice and sees only that practice's data in each.
 */

test.describe.configure({ mode: 'serial' });

const names = namesFor('join');
const trainee = names.person('trainee', 'trainee');

let practiceA: Practice;
let practiceB: Practice;
let link: string;
let managerA: BrowserContext;
let managerB: BrowserContext;
let mine: BrowserContext;
let me: Page;

test.beforeAll(async ({ browser }) => {
  practiceA = await setUpPractice(browser, 'join');
  practiceB = await setUpPractice(browser, 'join-b');
  await addTeamMember(browser, practiceA, trainee);
  managerA = await newContextFor(browser, practiceA.manager);
  managerB = await newContextFor(browser, practiceB.manager);

  // Practice A lets staff practise on drafts, so the trainee has calls to see there; practice B has none shown to staff.
  const settings = await managerA.newPage();
  await settings.goto('/settings');
  await settings.getByLabel('Let staff practise on draft scenarios').check();
  await settings.getByRole('button', { name: 'Save settings' }).click();
  await expect(settings.getByText('Your settings have been saved.')).toBeVisible();
});

test.afterAll(async () => {
  await Promise.all([managerA, managerB, mine].map(c => c?.close()));
});

/**
 * Presses "Switch" for a practice. The page it lands on still shows the previous practice (see the
 * test.fail below), so it is reloaded before anything is read from it.
 */
async function switchTo(to: Practice): Promise<void> {
  await me.goto('/account');
  await me.getByRole('button', { name: `Switch to ${to.name}` }).click();
  await me.waitForURL(url => url.pathname === '/');
  await me.reload();
}

test('an invitation for an email that has an account is a link, not an immediate membership', async () => {
  const page = await managerB.newPage();
  link = await inviteFromTeam(page, { ...trainee });
  await page.goto('/team');
  await expect(page.getByRole('table', { name: 'Invitations waiting to be used' })).toContainText(trainee.email);
  // Not a member yet: the staff table does not list them.
  await expect(page.getByRole('table', { name: 'Staff in your practice, with their calls' })).not.toContainText(trainee.email);
});

test('the invitation page asks for the current password; a wrong one is refused and the link still works', async ({ browser }) => {
  mine = await browser.newContext();
  me = await mine.newPage();
  await me.goto(link);
  await expect(me.getByRole('heading', { level: 1, name: `Join ${practiceB.name}` })).toBeVisible();
  await expect(me.getByLabel('Confirm password')).toHaveCount(0);

  await me.getByLabel('Your password').fill('Not my password at all 1234');
  await me.getByLabel(/I have read the/).check();
  await me.getByRole('button', { name: `Join ${practiceB.name}` }).click();
  await expect(me.getByLabel('Your password')).toHaveAttribute('aria-invalid', 'true');
  await expect(me).toHaveURL(link);

  // The failed try did not use the link up.
  await me.goto(link);
  await expect(me.getByRole('heading', { level: 1, name: `Join ${practiceB.name}` })).toBeVisible();
});

test('the right password joins the practice', async () => {
  await me.getByLabel('Your password').fill(trainee.password);
  await me.getByLabel(/I have read the/).check();
  await me.getByRole('button', { name: `Join ${practiceB.name}` }).click();
  await me.waitForURL(url => url.pathname === '/');
  await expect(me.getByRole('banner')).toContainText(practiceB.name);

  // The link is spent.
  const stranger = await me.context().browser()!.newContext();
  const page = await stranger.newPage();
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'This link cannot be used' })).toBeVisible();
  await stranger.close();

  // Practice B's manager now lists them.
  const manager = await managerB.newPage();
  await manager.goto('/team');
  await expect(manager.getByRole('table', { name: 'Staff in your practice, with their calls' })).toContainText(trainee.email);
});

test('the person switches practice on the account page and sees only that practice’s data in each', async () => {
  await me.goto('/account');
  await expect(me.getByRole('heading', { name: 'Your practices' })).toBeVisible();
  await expect(me.getByRole('listitem').filter({ hasText: practiceB.name })).toContainText('Current practice');

  // In practice B: nothing to practise, no calls.
  await me.goto('/');
  await expect(me.getByRole('button', { name: /^Start the call/ })).toHaveCount(0);
  await expect(me.getByText('There are no calls to practise yet')).toBeVisible();

  // Switch to practice A: the drafts it shows to staff; make a call there.
  await switchTo(practiceA);
  await expect(me.getByRole('banner')).toContainText(practiceA.name);
  await expect(me.getByRole('button', { name: /^Start the call/ })).toHaveCount(4);
  await startCallFromHome(me, 'Sore throat');
  await me.goto('/history');
  await expect(me.getByRole('table', { name: 'Your calls, newest first' })).toContainText('Sore throat');

  // Back to practice B: the call made in A is not there.
  await me.goto('/account');
  await expect(me.getByRole('listitem').filter({ hasText: practiceA.name })).toContainText('Current practice');
  await switchTo(practiceB);
  await expect(me.getByRole('banner')).toContainText(practiceB.name);
  await me.goto('/history');
  await expect(me.getByRole('heading', { name: 'You have not made any calls yet' })).toBeVisible();
  await me.goto('/');
  await expect(me.getByRole('button', { name: /^Start the call/ })).toHaveCount(0);
});

test('each practice’s manager sees the person only in their own practice’s data', async () => {
  const b = await managerB.newPage();
  await b.goto(`/team`);
  await b.getByRole('link', { name: trainee.name }).click();
  await expect(b.getByText('No calls yet.')).toBeVisible();
  const a = await managerA.newPage();
  await a.goto('/team');
  await a.getByRole('link', { name: trainee.name }).click();
  await expect(a.getByRole('table', { name: /calls, newest first/ })).toContainText('Sore throat');
});

// KNOWN APP BUG, reported to the maintainer: after "Switch" the page the person lands on still shows the
// practice they switched FROM (name in the header, and its scenarios) until they reload. The switch itself
// is saved (the reload shows the new practice). Probably the action reads the person before changing the
// session and the page it redirects to is drawn from that same read (not checked). When this is fixed this test will
// start passing, and Playwright will report "expected to fail"; then delete the test.fail line.
test('after switching, the page shows the new practice without a reload', async () => {
  test.fail(true, 'the page after Switch still shows the previous practice until reloaded');
  await me.goto('/account');
  await me.getByRole('button', { name: `Switch to ${practiceA.name}` }).click();
  await me.waitForURL(url => url.pathname === '/');
  await expect(me.getByRole('banner')).toContainText(practiceA.name, { timeout: 5000 });
});
