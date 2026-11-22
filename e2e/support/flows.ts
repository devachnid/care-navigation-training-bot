import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { ADMIN_STATE, BASE_URL, runId } from './env';

/** Steps that more than one spec needs, all done through the pages a person would use. */

export type Role = 'manager' | 'trainee' | 'clinician';

export type Person = {
  name: string;
  email: string;
  password: string;
  role: Role;
  /** Set once the person has an account and has signed in once; reuse it to open a signed-in context. */
  state?: Awaited<ReturnType<BrowserContext['storageState']>>;
  /** Their id in the practice, once read from the team page. */
  userId?: string;
};

export type Practice = {
  id: string;
  name: string;
  manager: Person;
};

const PASSWORD = 'Copper lantern quay 4417';

/** Names for one spec: every practice name and email starts `e2e-<runid>-<tag>`. */
export function namesFor(tag: string) {
  const prefix = `e2e-${runId()}-${tag}`;
  return {
    prefix,
    practiceName: (suffix = 'Surgery') => `${prefix} ${suffix}`,
    person: (role: Role, label: string = role, password = PASSWORD): Person => ({
      name: `${prefix} ${label}`,
      email: `${prefix}-${label}@example.test`.toLowerCase(),
      password,
      role,
    }),
  };
}

export async function newAdminContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: ADMIN_STATE, baseURL: BASE_URL });
}

export async function newContextFor(browser: Browser, person: Person): Promise<BrowserContext> {
  if (!person.state) throw new Error(`${person.email} has not signed in yet`);
  return browser.newContext({ storageState: person.state, baseURL: BASE_URL });
}

/** The text of a link box (a read-only text field) whose label starts with `label`. */
export async function readLink(page: Page, label: RegExp | string): Promise<string> {
  const box = page.getByRole('textbox', { name: label });
  await expect(box).toBeVisible();
  const value = await box.inputValue();
  expect(value).toContain('/invite/');
  return value;
}

/** Admin: adds a practice from /admin and returns its id (from the address of the page it opens). */
export async function addPractice(admin: Page, name: string): Promise<string> {
  await admin.goto('/admin');
  await admin.getByLabel('Practice name').fill(name);
  await admin.getByRole('button', { name: 'Add practice' }).click();
  await admin.waitForURL(/\/admin\/practices\/[0-9a-f-]{36}$/);
  await expect(admin.getByRole('heading', { level: 1, name })).toBeVisible();
  return admin.url().split('/').pop()!;
}

/** Admin: invites the practice's first manager from the practice page, and returns the one-time link. */
export async function inviteManager(admin: Page, practiceId: string, manager: Person): Promise<string> {
  await admin.goto(`/admin/practices/${practiceId}`);
  await admin.getByLabel("Manager's name").fill(manager.name);
  await admin.getByLabel('Work email').fill(manager.email);
  await admin.getByRole('button', { name: 'Make an invitation link' }).click();
  return readLink(admin, `Invitation link for ${manager.name}`);
}

/**
 * Opens an invitation link in a fresh browser context, makes the account and checks the person lands on
 * their home page. Returns the open context, signed in; the caller closes it.
 */
export async function acceptInvitation(browser: Browser, link: string, person: Person): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  await page.getByLabel('Choose a password').fill(person.password);
  await page.getByLabel('Confirm password').fill(person.password);
  await page.getByLabel(/I have read the/).check();
  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.waitForURL(url => url.pathname === '/');
  person.state = await context.storageState();
  return context;
}

/** Signs in through the sign-in page in a fresh context, and returns it. The caller closes it. */
export async function signInAs(browser: Browser, person: Person): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(person.email);
  await page.getByLabel('Password').fill(person.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(url => url.pathname !== '/sign-in');
  person.state = await context.storageState();
  return context;
}

/** Manager: invites someone from the Team page and returns the one-time link. */
export async function inviteFromTeam(manager: Page, person: Person): Promise<string> {
  await manager.goto('/team');
  const form = manager.locator('form', { has: manager.getByRole('button', { name: 'Make an invitation link' }) });
  await form.getByLabel('Name', { exact: true }).fill(person.name);
  await form.getByLabel('Work email').fill(person.email);
  await form.getByRole('radio', { name: person.role === 'manager' ? /^Manager/ : /^Trainee/ }).check();
  const approver = form.getByLabel(/Can approve scenarios/);
  if (person.role === 'clinician') await approver.check();
  else await approver.uncheck();
  await form.getByRole('button', { name: 'Make an invitation link' }).click();
  return readLink(manager, 'Invitation link');
}

/**
 * Creates a practice the way the service does: the admin adds it and invites its manager, who accepts
 * the link in a fresh browser. The manager's signed-in state is saved on `manager.state`.
 */
export async function setUpPractice(browser: Browser, tag: string, label = 'manager'): Promise<Practice> {
  const names = namesFor(tag);
  const manager = names.person('manager', label);
  const practiceName = names.practiceName();
  const adminContext = await newAdminContext(browser);
  try {
    const admin = await adminContext.newPage();
    const id = await addPractice(admin, practiceName);
    const link = await inviteManager(admin, id, manager);
    const managerContext = await acceptInvitation(browser, link, manager);
    await managerContext.close();
    return { id, name: practiceName, manager };
  } finally {
    await adminContext.close();
  }
}

/** Manager invites `person`, who accepts in a fresh browser. Their state is saved on `person.state`. */
export async function addTeamMember(browser: Browser, practice: Practice, person: Person): Promise<void> {
  const managerContext = await newContextFor(browser, practice.manager);
  try {
    const page = await managerContext.newPage();
    const link = await inviteFromTeam(page, person);
    const personContext = await acceptInvitation(browser, link, person);
    await personContext.close();
    await page.goto('/team');
    await page.getByRole('link', { name: person.name }).waitFor();
    const href = await page.getByRole('link', { name: person.name }).getAttribute('href');
    person.userId = href?.split('/').pop();
  } finally {
    await managerContext.close();
  }
}

/** The start of a practice scenario's page address for a title, read from the manager's scenarios page. */
export async function scenarioIdByTitle(page: Page, title: string): Promise<string> {
  await page.goto('/scenarios');
  const href = await page.getByRole('link', { name: title, exact: true }).getAttribute('href');
  if (!href) throw new Error(`no scenario called ${title}`);
  return href.split('/').pop()!;
}

/** Starts a call on the scenario from the home page and returns the session id from the call screen's address. */
export async function startCallFromHome(page: Page, scenarioTitle: string): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: `Start the call ${scenarioTitle}` }).click();
  await page.waitForURL(/\/call\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}
