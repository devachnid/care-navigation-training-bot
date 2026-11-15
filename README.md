# Care Navigation Call Practice

A training tool for GP reception staff in Wales. A receptionist chooses a scenario and has a spoken phone call with an AI playing a patient. Their job is to navigate the caller to the right service. When they hang up they get the transcript and a scored debrief.

It is used by several practices at once. Each practice has its own staff, calls, scores and scenarios, and nobody can see another practice's data. Three kinds of person use it:

- **Trainees** take calls and read their own debriefs and history.
- **Managers** invite staff, see every call and score in their practice, choose which scenarios staff can use and change practice settings.
- **The service administrator** adds practices and invites each practice's first manager. They see how much each practice uses the service, but never the content of a call.

> **Scenarios are drafts until a clinician at your practice approves them.** The library scenarios come with answer keys that have not been checked against any practice's protocols. A manager can give a clinician permission to approve scenarios, and the clinician approves each one after checking it. Until then staff can only practise on drafts if the manager switches that on, and every draft call says so.
>
> **Scores are for learning, not for appraisal.** A debrief is an AI's judgement against an answer key. The same call can score a little differently on different runs, and the transcript it is based on is reported by the trainee's browser (see [Known limits](#known-limits)).

Never put real patient details in a scenario, and tell trainees never to use any on a call.

## How it works

1. Staff sign in with their own account. A manager invites them with a one-time link; there is no shared code.
2. The trainee starts a call. The server stores a copy of the scenario as it is at that moment and mints a short-lived, single-use voice token. The AI Gateway key never reaches the browser.
3. The browser opens a WebSocket to the voice model through Vercel AI Gateway. Audio goes directly between the browser and the model and is never stored. The caller speaks first, and both sides are transcribed as text.
4. On hang-up the browser sends the transcript to the server, which checks it, saves it, and asks a separate text model to score it against the scenario's answer key and the seven-item rubric.
5. The trainee reads the debrief. Managers can read any debrief in their practice. If the practice has set a retention period, a daily job deletes old transcripts.

The caller model never sees the answer key, and the assessor model never role-plays. The design, the data model and the reasons for these choices are in [`docs/design/full-app.md`](docs/design/full-app.md).

## Local setup

You need Node 22 (CI uses 22), a [Neon](https://neon.tech) Postgres database and a Vercel AI Gateway API key. Use the Neon `preview` branch for local work, never the production branch.

1. Install the dependencies.

   ```bash
   npm ci
   ```

2. Create your environment file.

   ```bash
   cp .env.example .env.local
   ```

3. Fill in `.env.local`: at least `DATABASE_URL` (the pooled connection string for the `preview` branch), `AI_GATEWAY_API_KEY`, `DEBRIEF_MODEL` and, for first-run setup, a `SETUP_CODE` of 20 or more characters. The [table below](#environment-variables) lists everything. `.env.local` is not committed.

4. Apply the migrations.

   ```bash
   npm run db:migrate
   ```

5. Load the scenario library.

   ```bash
   npm run db:seed
   ```

6. Start the dev server.

   ```bash
   npm run dev
   ```

7. Open <http://localhost:3000/setup> in Chrome or Edge with a headset. Enter the `SETUP_CODE`, your name, email address and password, and a practice name. This creates the service administrator, the first practice (with the library scenarios as drafts) and your manager account in it, and signs you in. `/setup` works only while the database has no users, so on a database that already has accounts it shows "not found": sign in instead.

To work as a trainee, invite yourself from the Team page (use a second email address) and open the one-time link it shows.

## Environment variables

Set them in `.env.local` locally and in the Vercel project settings for deployments (Production and Preview separately). Next.js reads `.env.local` for `npm run dev`; the database and evaluation scripts read it themselves.

| Name | Required | What it does | Used in |
|---|---|---|---|
| `DATABASE_URL` | Required | Neon Postgres connection string (pooled). Production uses the Neon default branch; previews and local work use `preview`. | `src/db/client.ts`, `src/db/migrate.ts` (so also `db:seed` and `admin:reset-link`) |
| `AI_GATEWAY_API_KEY` | Required | Vercel AI Gateway key, read by the AI SDK's gateway provider. Server only. Pays for the voice and debrief models. | voice token route `src/app/api/sessions/[sessionId]/token/route.ts`; debrief `src/debrief/assess.ts`; `evals/debrief/run.ts` checks it is set |
| `DEBRIEF_MODEL` | Required | Gateway model id of the text model that writes debriefs, for example `anthropic/claude-sonnet-5.5`. Without it every debrief fails. Change it only after running the evaluation set. | `src/debrief/run.ts`, `evals/debrief/run.ts` |
| `SETUP_CODE` | Required for the first run only | One-time code for `/setup`. At least 20 characters, otherwise setup stays closed. It does nothing once any user exists; remove it afterwards. | `src/auth/setup.ts` |
| `CRON_SECRET` | Required in production for transcript deletion | At least 20 random characters. Vercel sends it as `Authorization: Bearer ...` to the daily retention job. Without it the job answers 503 and nothing is deleted, whatever practices have chosen. | `src/app/api/cron/retention/route.ts` |
| `REALTIME_MODEL` | Optional | Voice model gateway id. Default `openai/gpt-realtime-2.1`. | token route; `src/app/(call)/call/[sessionId]/page.tsx` |
| `REALTIME_TURN_DETECTION` | Optional | JSON that overrides how the caller decides the receptionist has finished speaking. Default `{"type":"semantic-vad"}`. For silence-based detection with a longer wait: `{"type":"server-vad","silenceDurationMs":900}`. Invalid JSON is ignored with a warning. | `src/patient/session-config.ts` |
| `REALTIME_PROVIDER_OPTIONS` | Optional | JSON passed to the voice session as provider options. Invalid JSON is ignored with a warning. | `src/patient/session-config.ts` |
| `MAX_CALL_SECONDS` | Optional | Length at which the call page hangs up, with a warning one minute before. Default `600`. A value that is not a positive whole number falls back to the default. | `src/sessions/dal.ts`, call page |
| `DAILY_CALL_LIMIT` | Optional | Calls one person can start per day (Europe/London day, across all their practices). Default `25`. Same fallback rule. | `src/sessions/dal.ts` |

`ACCESS_CODE`, used by the proof of concept, is retired and does nothing.

## npm scripts

| Script | What it is for |
|---|---|
| `npm run dev` | Dev server (Turbopack) on port 3000. |
| `npm run build` | The deploy build: applies migrations (`db:migrate`), syncs the scenario library (`db:seed`), then `next build`. It writes to whichever database `DATABASE_URL` points at. |
| `npm start` | Serves a production build. |
| `npm run lint` | ESLint, including the rule that only data-access modules may use the database. |
| `npm run typecheck` | Generates Next route types, then runs the TypeScript compiler. |
| `npm test` | Unit and data-access tests (Vitest). |
| `npm run db:generate` | After editing `src/db/schema.ts`: writes a new SQL migration into `drizzle/`. Review it and commit it. |
| `npm run db:migrate` | Applies the migrations in `drizzle/` to `DATABASE_URL`. |
| `npm run db:seed` | Copies `src/scenarios/seed.ts` into the shared library table. Never changes a practice's own scenarios. |
| `npm run e2e` | The end-to-end suite: drives the real app in a browser against a test database. See [`e2e/README.md`](e2e/README.md). |
| `npm run e2e:voice` | One real voice call end to end. Costs a few pence. |
| `npm run eval:debrief` | Runs the debrief evaluation set against the real model. Costs money. See [`docs/engineering/debrief-quality.md`](docs/engineering/debrief-quality.md). |
| `npm run admin:reset-link -- <email>` | Makes a 24-hour password reset link for any account, for someone with database access (for example a locked-out administrator). See [`docs/operations.md`](docs/operations.md). |

## Checks

| Check | How | Needs | Cost |
|---|---|---|---|
| Lint and types | `npm run lint`, `npm run typecheck` | Nothing | Free |
| Unit and data-access tests | `npm test` | Nothing: no network, database or keys. Data-access tests run the real migrations on an in-process Postgres (PGlite). | Free |
| Compile | `npx next build` (not `npm run build`, which also migrates a database) | Nothing | Free |
| Debrief evaluation | `npm run eval:debrief -- --runs 3 --json <file>` | `AI_GATEWAY_API_KEY` and `DEBRIEF_MODEL` in `.env.local`; network access to the gateway. Where the sandbox needs it, prefix with `NODE_USE_ENV_PROXY=1`. | About 1p per assessment; a full run is 19 cases x 3 runs = 57 assessments, about 60p and 1.5 minutes. An estimate, not checked against a bill. |
| End-to-end suite | `E2E_ALLOW=1 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run e2e` | A test database in `.env.local` (it refuses the production host) and a platform admin account in it. It builds and starts the app itself, drives it in Chromium, and leaves its `e2e-...` test practices behind. See [`e2e/README.md`](e2e/README.md). | Free. About 2 minutes. |
| Voice end-to-end test | The same variables, then `npm run e2e:voice` | As above, plus `AI_GATEWAY_API_KEY`. Takes one real call with a recorded synthetic receptionist played into a fake microphone, and checks the debrief. | A few pence per run. |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, `npm test` and `npx next build` on every pull request and push to `main`. It never runs the evaluation, the end-to-end suite or anything that migrates a database.

## Deploying

- **Branches.** `main` is production. Work happens on branches and reaches `main` by pull request. Every pull request gets a Vercel preview deployment, which uses the Neon `preview` branch. Production uses the Neon default branch. This depends on `DATABASE_URL` being set differently for Production and Preview in Vercel.
- **Build.** Vercel runs `npm run build`, so every deployment, preview or production, first migrates and seeds the database its environment points at. Migrations therefore reach a database before the new code is live. A code rollback does not undo a migration.
- **Region.** `vercel.json` runs server functions in London (`lhr1`).
- **Daily job.** `vercel.json` schedules `/api/cron/retention` at 03:20 UTC every day. It deletes transcripts older than each practice's retention period. Vercel runs cron jobs on the production deployment, and the job needs `CRON_SECRET` set there.
- **First deployment.** Set the environment variables, deploy, then open `/setup` once. The full runbook is [`docs/operations.md`](docs/operations.md).

## Known limits

The first three come from one choice inherited from the proof of concept: the trainee's browser holds the voice connection. Evidence is in [`docs/engineering/voice-findings.md`](docs/engineering/voice-findings.md). Relaying the voice connection through our own server would fix all three, and is the first thing to do if scores ever matter beyond practice.

1. **The browser reports the transcript.** A trainee who wanted to could submit a transcript they wrote. The server refuses a transcript that is too long to have been spoken in the time the call was connected, and gives the assessor the transcript as data, but neither stops a determined cheat. A manager can read the transcript behind any score.
2. **The caller's prompt, including the hidden facts, is visible in the trainee's browser** to someone who opens developer tools. The answer key is not.
3. **The server cannot end a voice session.** It limits how many voice tokens are issued (3 per call, 25 calls a day per person). The 10-minute hang-up is done by the page. Set a monthly budget on the AI Gateway key.

Also:

- **Library scenarios are drafts** until a clinician at each practice approves them, and the debrief evaluation set has not been checked by a clinician or a practice manager.
- **The debrief is an AI judgement** and varies a little between runs.
- **The practice network is untested.** The voice connection is a WebSocket to `ai-gateway.vercel.sh`, which a practice firewall may block.
- **The voice API is experimental.** AI Gateway realtime and the AI SDK realtime hook can change in patch releases, so `ai`, `@ai-sdk/react` and `@ai-sdk/gateway` are pinned to exact versions. Re-test a call after any upgrade.
- **Deletion is by retention period only.** There is no screen or command to delete one person's data or one call. Retention removes transcripts, quoted lines and reports of problems, and keeps scores, accounts and the audit log.
- **A call cut off mid-debrief** can stay at "Debrief being prepared" and is not retried.
- English only. No audio is stored. No analytics, third-party scripts or external assets. The PoC was used in Chrome and Edge on desktop; no other browser has been tested.

The full list, with the smaller accepted trade-offs, is section 7a of the design.

## More documentation

| File | What is in it |
|---|---|
| [`docs/operations.md`](docs/operations.md) | Runbook for whoever runs the service: setup, practices, lock-outs, secrets, cost, changing models and scenarios, migrations, troubleshooting. |
| [`docs/design/full-app.md`](docs/design/full-app.md) | The design: people and permissions, architecture rules, data model, sign-in, limits, known limits, security headers, retention. |
| [`docs/engineering/next16-notes.md`](docs/engineering/next16-notes.md) | Next.js 16 conventions that differ from older versions. Read it, and the docs bundled in `node_modules/next/dist/docs/`, before writing Next code (see `AGENTS.md`). |
| [`docs/engineering/voice-findings.md`](docs/engineering/voice-findings.md) | What was tested about the voice connection, turn-taking, the debrief model and why the caller's prompt reaches the browser. |
| [`docs/engineering/debrief-quality.md`](docs/engineering/debrief-quality.md) | The debrief evaluation set, how to run it, results, and the rule for changing the rubric, prompt or model. |
| `e2e/README.md` | The end-to-end suite and the voice end-to-end test. |
| [`src/ui/README.md`](src/ui/README.md), [`src/app/_lib/README.md`](src/app/_lib/README.md) | The shared components and the page and form helpers. |
| [`docs/archive/`](docs/archive/) | The proof-of-concept brief and plan. Historical. |

## Scenarios and the rubric

To add or change a library scenario, edit [`src/scenarios/seed.ts`](src/scenarios/seed.ts) and see "Adding or changing a library scenario" in the runbook, which says what happens to practices' existing copies. The debrief scores seven items 0 to 2 (greeting and identification, information gathering, red flag recognition, correct destination, stayed in role, explanation, manner) in `src/debrief/rubric.ts`; the overall score is the percentage of available marks, leaving out red flag recognition when the scenario has no red flag. A call is shown as **Passed** when the outcome was correct and not unsafe. Code enforces two rules after the model answers (`src/debrief/assess.ts`): feedback whose quote is not in the transcript is dropped, and a red flag that was missed with the caller not sent to the right place is an unsafe outcome. An unsafe outcome is never a correct one.
