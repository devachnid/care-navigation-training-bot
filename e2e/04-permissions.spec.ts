import { expect, request as playwrightRequest, test, type APIRequestContext, type APIResponse, type Browser, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { finishCall } from './support/call';
import { ADMIN_STATE, AUTH_DIR, BASE_URL, ROOT, runId } from './support/env';
import { addTeamMember, namesFor, newContextFor, scenarioIdByTitle, setUpPractice, startCallFromHome, type Person } from './support/flows';

/**
 * Journey 4: the permissions matrix. Every route in the app is requested as each kind of person and
 * the outcome is compared with the table below. When you add a page or a route, add a row (see
 * e2e/README.md); the last test fails if a route in src/app has no row.
 *
 * Requests are made without following redirects, so "sent to sign in" and "page shown" are told apart.
 */

// ---------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------

const PERSONAS = ['anon', 'trainee', 'clinician', 'manager', 'otherManager', 'admin'] as const;
type Persona = (typeof PERSONAS)[number];

const DESCRIPTION: Record<Persona, string> = {
  anon: 'signed out',
  trainee: 'trainee',
  clinician: 'clinician (a trainee who can approve scenarios)',
  manager: 'manager of practice A (where the data is)',
  otherManager: 'manager of practice B (another practice)',
  admin: 'platform admin, who is also a manager of a third practice (Test Surgery). A platform admin with no practice cannot be made through the app, so that row is not here.',
};

// ---------------------------------------------------------------------------
// What can happen
// ---------------------------------------------------------------------------

/** A page or response, described in a few words. */
type Outcome = string;
const PAGE: Outcome = '200';
const NOT_FOUND: Outcome = '404';
const SIGN_IN: Outcome = 'redirect /sign-in';
const redirectTo = (where: string): Outcome => `redirect ${where}`;
const status = (code: number): Outcome => String(code);

type Expectation = Record<Persona, Outcome>;

/** Everyone gets `base`, except where `overrides` says otherwise. */
const rule = (base: Outcome, overrides: Partial<Expectation> = {}): Expectation => ({
  anon: base,
  trainee: base,
  clinician: base,
  manager: base,
  otherManager: base,
  admin: base,
  ...overrides,
});

/** A page for people signed in to a practice; signed-out people are sent to sign in. */
const signedIn = (overrides: Partial<Expectation> = {}) => rule(PAGE, { anon: SIGN_IN, ...overrides });
/** A page for managers only (the platform admin is a manager of another practice, so it opens for them too). */
const managersOnly = (overrides: Partial<Expectation> = {}) =>
  rule(NOT_FOUND, { anon: SIGN_IN, manager: PAGE, otherManager: PAGE, admin: PAGE, ...overrides });
/** A page for managers and approvers. */
const managersAndApprovers = (overrides: Partial<Expectation> = {}) => managersOnly({ clinician: PAGE, ...overrides });

type Row = {
  method: 'GET' | 'POST';
  /** `{callId}` and the like are filled in from the data this spec creates in practice A. */
  path: string;
  expect: Expectation;
  /** POST only. */
  body?: unknown;
  /** Sent with the request. The default for a POST is a same-origin `Origin`. */
  headers?: Record<string, string>;
  note?: string;
};

const MISSING = '00000000-0000-4000-8000-00000000e2e0';

// ---------------------------------------------------------------------------
// THE TABLE. One row per route (and per interesting id). Add yours here.
// ---------------------------------------------------------------------------

const ROUTES: Row[] = [
  // Public pages.
  { method: 'GET', path: '/privacy', expect: rule(PAGE) },
  { method: 'GET', path: '/invite/not-a-real-token', expect: rule(PAGE), note: 'says the link cannot be used' },
  { method: 'GET', path: '/sign-in', expect: rule(PAGE, { trainee: redirectTo('/'), clinician: redirectTo('/'), manager: redirectTo('/'), otherManager: redirectTo('/'), admin: redirectTo('/') }) },
  { method: 'GET', path: '/setup', expect: rule(NOT_FOUND), note: 'closed once anyone has an account' },
  { method: 'GET', path: '/styleguide', expect: rule(NOT_FOUND), note: 'development only; this is a production build' },
  { method: 'GET', path: '/there-is-no-page-here', expect: rule(NOT_FOUND) },

  // Everyone in a practice.
  { method: 'GET', path: '/', expect: signedIn() },
  { method: 'GET', path: '/history', expect: signedIn() },
  { method: 'GET', path: '/account', expect: signedIn() },
  { method: 'GET', path: '/no-access', expect: rule(redirectTo('/'), { anon: SIGN_IN }), note: 'for people with no practice; members are sent home' },

  // A call and its debrief belong to the person who made it; managers of the practice may read the debrief.
  { method: 'GET', path: '/call/{callId}', expect: rule(NOT_FOUND, { anon: SIGN_IN, trainee: redirectTo('/debrief/{callId}') }), note: 'only the caller; a finished call goes to its debrief' },
  { method: 'GET', path: `/call/${MISSING}`, expect: rule(NOT_FOUND, { anon: SIGN_IN }) },
  { method: 'GET', path: '/debrief/{callId}', expect: rule(NOT_FOUND, { anon: SIGN_IN, trainee: PAGE, manager: PAGE }), note: 'the caller and managers of the practice' },
  { method: 'GET', path: `/debrief/${MISSING}`, expect: rule(NOT_FOUND, { anon: SIGN_IN }) },

  // Team: managers.
  { method: 'GET', path: '/team', expect: managersOnly() },
  { method: 'GET', path: '/team/{userId}', expect: managersOnly({ otherManager: NOT_FOUND, admin: NOT_FOUND }), note: 'a person in practice A' },
  { method: 'GET', path: `/team/${MISSING}`, expect: managersOnly({ otherManager: NOT_FOUND, admin: NOT_FOUND, manager: NOT_FOUND }) },
  { method: 'GET', path: '/reports', expect: managersOnly() },
  { method: 'GET', path: '/reports/export', expect: rule(NOT_FOUND, { anon: status(401), manager: status(200), otherManager: status(200), admin: status(200) }), note: 'JSON status, not a redirect: 401 signed out, 404 not a manager' },
  { method: 'GET', path: '/settings', expect: managersOnly() },

  // Scenarios: managers and approvers.
  { method: 'GET', path: '/scenarios', expect: managersAndApprovers() },
  { method: 'GET', path: '/scenarios/new', expect: managersAndApprovers() },
  { method: 'GET', path: '/scenarios/{scenarioId}', expect: managersAndApprovers({ otherManager: NOT_FOUND, admin: NOT_FOUND }), note: 'a scenario of practice A' },
  { method: 'GET', path: `/scenarios/${MISSING}`, expect: managersAndApprovers({ otherManager: NOT_FOUND, admin: NOT_FOUND, manager: NOT_FOUND, clinician: NOT_FOUND }) },

  // Platform admin.
  { method: 'GET', path: '/admin', expect: rule(NOT_FOUND, { anon: SIGN_IN, admin: PAGE }) },
  { method: 'GET', path: '/admin/practices/{practiceId}', expect: rule(NOT_FOUND, { anon: SIGN_IN, admin: PAGE }) },
  { method: 'GET', path: `/admin/practices/${MISSING}`, expect: rule(NOT_FOUND, { anon: SIGN_IN }) },

  // The two JSON routes. Answers are statuses. The call is finished, so nothing is changed or minted.
  { method: 'POST', path: '/api/sessions/{callId}/token', expect: rule(NOT_FOUND, { anon: status(401), trainee: status(409) }), note: '409: the caller’s own call has ended' },
  { method: 'POST', path: '/api/sessions/{callId}/end', body: END_BODY(), expect: rule(NOT_FOUND, { anon: status(401), trainee: status(200) }), note: '200: the caller’s own call, already ended, is left alone' },
  { method: 'POST', path: '/api/sessions/{callId}/token', headers: { Origin: 'https://not-this-site.example' }, expect: rule(status(403)), note: 'another site cannot post' },
  { method: 'POST', path: '/api/sessions/{callId}/end', body: END_BODY(), headers: { Origin: 'https://not-this-site.example' }, expect: rule(status(403)), note: 'another site cannot post' },
  { method: 'POST', path: `/api/sessions/${MISSING}/token`, expect: rule(NOT_FOUND, { anon: status(401) }) },
  { method: 'GET', path: '/api/sessions/{callId}/token', expect: rule(status(405)), note: 'POST only' },
  { method: 'GET', path: '/api/sessions/{callId}/end', expect: rule(status(405)), note: 'POST only' },
];

function END_BODY() {
  return { durationSeconds: 30, turns: [{ speaker: 'trainee', text: 'Hello, this is the surgery.' }] };
}

// ---------------------------------------------------------------------------
// The data the table's `{ids}` stand for
// ---------------------------------------------------------------------------

const names = namesFor('perm');
const trainee = names.person('trainee', 'trainee');
const clinician = names.person('clinician', 'clinician');

type StorageState = NonNullable<Person['state']>;
type Setup = { ids: Record<string, string>; states: Record<Exclude<Persona, 'anon' | 'admin'>, StorageState> };

let ids: Record<string, string>;
const clients = {} as Record<Persona, APIRequestContext>;
let contexts: BrowserContext[] = [];

/**
 * Practice A (a manager, a trainee and a clinician), practice B (a manager), and a finished call with a
 * debrief in practice A. Rows are independent, so they do not run as a serial group: when a row fails
 * Playwright starts a fresh worker for the rest, and that worker must not build all of this again. So
 * the result is kept in a file named for this run (git-ignored) and reused.
 */
async function buildSetup(browser: Browser): Promise<Setup> {
  const practiceA = await setUpPractice(browser, 'perm');
  await addTeamMember(browser, practiceA, trainee);
  await addTeamMember(browser, practiceA, clinician);
  const practiceB = await setUpPractice(browser, 'perm-b');

  const traineeContext = await newContextFor(browser, trainee);
  const managerContext = await newContextFor(browser, practiceA.manager);
  const clinicianContext = await newContextFor(browser, clinician);
  contexts = [traineeContext, managerContext, clinicianContext];
  const scenarioId = await scenarioIdByTitle(await managerContext.newPage(), 'Sore throat');
  const approver = await clinicianContext.newPage();
  await approver.goto(`/scenarios/${scenarioId}`);
  await approver.getByLabel(/I have checked this scenario/).check();
  await approver.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(approver.getByText(new RegExp(`^Approved by ${clinician.name}`))).toBeVisible();
  const callId = await startCallFromHome(await traineeContext.newPage(), 'Sore throat');
  await finishCall(trainee, callId);

  return {
    ids: { practiceId: practiceA.id, scenarioId, userId: trainee.userId!, callId },
    states: { trainee: trainee.state!, clinician: clinician.state!, manager: practiceA.manager.state!, otherManager: practiceB.manager.state! },
  };
}

test.beforeAll(async ({ browser }) => {
  const cache = path.join(AUTH_DIR, `permissions-${runId()}.json`);
  let setup: Setup;
  if (fs.existsSync(cache)) {
    setup = JSON.parse(fs.readFileSync(cache, 'utf8')) as Setup;
  } else {
    setup = await buildSetup(browser);
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    fs.writeFileSync(cache, JSON.stringify(setup));
  }
  ids = setup.ids;

  const states: Record<Persona, Parameters<typeof playwrightRequest.newContext>[0]> = {
    anon: {},
    trainee: { storageState: setup.states.trainee },
    clinician: { storageState: setup.states.clinician },
    manager: { storageState: setup.states.manager },
    otherManager: { storageState: setup.states.otherManager },
    admin: { storageState: ADMIN_STATE },
  };
  for (const persona of PERSONAS) {
    clients[persona] = await playwrightRequest.newContext({ baseURL: BASE_URL, ...states[persona] });
  }
});

test.afterAll(async () => {
  await Promise.all(contexts.map(c => c.close()));
  await Promise.all(Object.values(clients).map(c => c.dispose()));
});

// ---------------------------------------------------------------------------
// Asking, and describing what came back
// ---------------------------------------------------------------------------

const fill = (template: string) => template.replace(/\{(\w+)\}/g, (_, key: string) => ids[key] ?? `{${key}?}`);

function describeResponse(response: APIResponse): Outcome {
  const code = response.status();
  if (code >= 300 && code < 400) {
    const location = response.headers()['location'] ?? '(no location)';
    return redirectTo(new URL(location, BASE_URL).pathname);
  }
  return String(code);
}

async function ask(persona: Persona, row: Row): Promise<Outcome> {
  const client = clients[persona];
  const url = fill(row.path);
  if (row.method === 'GET') return describeResponse(await client.get(url, { maxRedirects: 0 }));
  const response = await client.post(url, {
    maxRedirects: 0,
    headers: { Origin: BASE_URL, ...row.headers },
    data: row.body,
  });
  return describeResponse(response);
}

for (const row of ROUTES) {
  const title = `${row.method} ${row.path}${row.note ? ` (${row.note})` : ''}`;
  test(title, async () => {
    const got = {} as Expectation;
    for (const persona of PERSONAS) got[persona] = await ask(persona, row);
    const want = Object.fromEntries(PERSONAS.map(p => [p, fill(row.expect[p])])) as Expectation;
    // One comparison for the whole row, so a failure shows every person at once.
    expect(got, `${row.method} ${fill(row.path)}. Who: ${PERSONAS.map(p => `${p} = ${DESCRIPTION[p]}`).join('; ')}`).toEqual(want);
  });
}

// ---------------------------------------------------------------------------
// The table must cover the app
// ---------------------------------------------------------------------------

/** Every page and route handler under src/app, as a URL pattern with each `[param]` as `[]`. */
function routesInApp(): string[] {
  const root = path.join(ROOT, 'src', 'app');
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^(page|route)\.(tsx|ts|jsx|js)$/.test(entry.name)) {
        const segments = path
          .relative(root, dir)
          .split(path.sep)
          .filter(s => s && !(s.startsWith('(') && s.endsWith(')')) && !s.startsWith('@') && !s.startsWith('_'))
          .map(s => (s.startsWith('[') ? '[]' : s));
        found.push('/' + segments.join('/'));
      }
    }
  };
  walk(root);
  return [...new Set(found)].sort();
}

const asPattern = (p: string) =>
  p
    .split('/')
    .map(s => (/^\{\w+\}$/.test(s) || /^[0-9a-f-]{36}$/.test(s) || s === 'not-a-real-token' ? '[]' : s))
    .join('/') || '/';

test('every page and route in src/app has a row in the table', () => {
  const covered = new Set(ROUTES.map(r => asPattern(r.path)));
  // The unknown-address row stands for the not-found page, which is not a route of its own.
  covered.delete('/there-is-no-page-here');
  const missing = routesInApp().filter(r => !covered.has(r));
  expect(missing, 'These routes exist in src/app but have no row in the permissions table (e2e/04-permissions.spec.ts). Add one.').toEqual([]);
  const extra = [...covered].filter(r => !routesInApp().includes(r));
  expect(extra, 'These rows are for routes that no longer exist in src/app. Remove them.').toEqual([]);
});
