# End-to-end tests

These drive the real app in a real browser (Chromium, through Playwright) against a real test database. They prove that the pages, actions and permissions hang together. Run them before every release. The unit and data-access tests (`npm test`) need no network; these do.

## What it covers

One spec file per journey. Each creates its own practice, so the files run side by side.

| File | Journey |
| --- | --- |
| `01-practice-setup.spec.ts` | The admin adds a practice and invites a manager; the link is shown once; the manager accepts in a fresh browser and lands on their home page; the used link no longer works; the admin can cancel a manager link. |
| `02-team.spec.ts` | A manager invites a trainee and a clinician (a trainee who can approve scenarios); both join; role change, approver switch, deactivate (the person is turned away) and reactivate; a reset link works once and the old password stops working; revoke; a refused duplicate invitation keeps what was typed. |
| `03-scenarios.spec.ts` | New scenarios are drafts; the trainee sees none; the manager cannot approve; the clinician can; the trainee sees exactly that one; editing makes it a draft again; hide and show; "let staff practise on drafts" shows drafts with a Draft label. |
| `04-permissions.spec.ts` | The permissions matrix: every route in `src/app` requested as signed-out, trainee, clinician, manager, manager of another practice and platform admin, compared with a table written as data. Fails if a route in `src/app` has no row. |
| `05-call-lifecycle.spec.ts` | A call without audio: start in the browser, the call page holds no answer key, finish the call through the support helper, then the trainee's history, debrief and progress, a reported problem, the manager's team page, reports, CSV and "dealt with", and a manager of another practice seeing none of it. |
| `06-account.spec.ts` | Wrong password at sign-in (generic message); wrong current password; changing the password signs out other browsers; the old password stops working; sign out ends the session. |
| `07-voice.spec.ts` (`@voice`) | A real voice call, see below. Not part of `npm run e2e`. |

### The voice test

`npm run e2e:voice` has a manager of a fresh practice take a real call on the "Repeat prescription with buried red flag" draft. Chromium's fake microphone plays `fixtures/good.wav`, the real voice model plays the caller, the test hangs up after about 78 seconds and the real debrief model marks it. It asserts a numeric score, "Outcome correct: Yes", and a transcript with both speakers that mentions "chest" and "999" (or "nine nine nine"). It takes about three minutes, costs a few pence, and needs `AI_GATEWAY_API_KEY` (read from `.env.local`). If `HTTPS_PROXY` is set the browser uses it as its proxy, with `localhost` excluded.

`fixtures/good.wav` is a synthetic receptionist voice reading a script, 16 kHz mono, about 114 seconds. It contains no real person's voice and no real data.

## Running them

1. Use a test or preview database. `.env.local` must hold its `DATABASE_URL` (and `AI_GATEWAY_API_KEY` for the voice test). The suite creates data in it; see "What it leaves behind".
2. Install Chromium once if this machine has none: `npx playwright install chromium`.
3. Set the variables below and run:

```sh
export NODE_USE_ENV_PROXY=1            # only on machines that reach the network through a proxy
E2E_ALLOW=1 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run e2e
E2E_ALLOW=1 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run e2e:voice
```

Playwright builds the app (`npx next build`, never `npm run build`, which runs migrations) and starts it on port 3232 with `next start`. If something is already listening on that port it is used as it is, so a stale server gives stale results: stop it first, or give a different port with `E2E_PORT`.

To run one file, or one test: `npx playwright test e2e/04-permissions.spec.ts` or `npx playwright test -g "reset link"`. Traces are off; turn them on for a failing run with `--trace on`. The HTML report is written to `playwright-report/` (`npx playwright show-report`).

### Against a preview database

Point `DATABASE_URL` in `.env.local` at the preview branch and run as above. The suite refuses to start if `E2E_ALLOW=1` is not set, if `DATABASE_URL` is missing, or if its host starts `ep-dry-wildflower` (production). It does not assume any particular preview host: only production is refused, and the opt-in is what says you checked.

### Environment variables

| Variable | Meaning |
| --- | --- |
| `E2E_ALLOW` | Must be `1`. Says you have checked `DATABASE_URL` is not a database you mind adding test data to. |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | A platform admin who can add practices. Only signed in to; the suite never changes that account or its practice. Not written in any file in the repository. |
| `DATABASE_URL` | From `.env.local`. |
| `AI_GATEWAY_API_KEY` | From `.env.local`. Voice test only. |
| `PLAYWRIGHT_CHROMIUM_PATH` | Optional. Path of a Chromium to use instead of the one `npx playwright install chromium` fetched. Leave it unset on a normal machine. |
| `E2E_PORT` | Optional. Port for the app. Default 3232. |
| `E2E_WORKERS` | Optional. Spec files run at once. Default 4. |
| `HTTPS_PROXY` | If set, the voice test's browser uses it (with `localhost` excluded). |

### Sign-in throttle

The app counts sign-in attempts per address: 30 in 15 minutes, whoever the person is, and failed or successful. A suite that signs in many times from one machine can use that up, and then every sign-in is refused with the usual "do not match" message. The suite signs in as little as it can: the admin once (the cookie is kept in `e2e/.auth/admin.json`, which is git-ignored, and reused while it works), and new people through their invitation links, which are not sign-ins. A run uses about six. If a run fails at sign-in for no reason, wait 15 minutes. The same limit is shared by anyone else using the same database from the same address.

## What it leaves behind

Everything is created through the app and nothing is deleted, because the app has no delete.

- Practices named `e2e-<runid>-<journey> ...`, each with its people (`e2e-<runid>-<journey>-<role>@example.test`), invitations, scenarios (the library copies), calls, debriefs and audit entries. About ten practices and thirty people per run. `<runid>` is different for every run and printed at the start of the run.
- Sign-in sessions and throttle counters, which expire.

Test data is told apart by the `e2e-` prefix. The suite never reads or changes anything it did not create, except that the platform admin's own pages are requested (read only) in the permissions table, and the admin signs in.

## The support helper

The one thing the pages cannot do here is finish a call: that needs a microphone and the debrief model. `support/call-helper.ts` does it with the backend functions the app uses (`signIn`, `claimForToken`, `endCall`, `saveDebrief`), run with `tsx` by `support/call.ts`, as the person who owns the call. It writes nothing with raw SQL. The call itself is still started in the browser.

## Adding a route to the permissions table

Open `04-permissions.spec.ts` and find `ROUTES`. Add one row:

```ts
{ method: 'GET', path: '/things/{thingId}', expect: managersOnly({ otherManager: NOT_FOUND, admin: NOT_FOUND }), note: 'a thing in practice A' },
```

- `path` may use `{practiceId}`, `{scenarioId}`, `{userId}` and `{callId}`: real ids from practice A, created at the top of the spec. If your route needs another id, create it in `beforeAll` and add it to `ids`.
- `expect` says what each person gets. Start from a helper and list only the exceptions: `rule(base, overrides)` (everyone gets `base`), `signedIn()`, `managersOnly()`, `managersAndApprovers()`. The people are `anon`, `trainee`, `clinician`, `manager` (practice A), `otherManager` (practice B) and `admin`.
- Outcomes: `PAGE` (200), `NOT_FOUND` (404), `SIGN_IN` (sent to sign in), `redirectTo('/somewhere')`, `status(401)`.
- A page for something that belongs to one practice (a call, a person, a scenario) should be `NOT_FOUND` for `otherManager` and `admin`. If it is not, that is a bug, not a reason to change the table.

The last test in the file lists the routes under `src/app` and fails if one has no row, so a new page cannot be forgotten.

The `admin` person is the platform admin used for the whole suite, who is also a manager of a practice that is not practice A. A platform admin with no practice at all cannot be made through the app (the only way to give someone the admin flag is the one-off setup), so that case is not in the table.
