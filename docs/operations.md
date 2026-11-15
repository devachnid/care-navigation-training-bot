# Running the service

A runbook for the person who runs the deployment (the "service administrator"). It says what to do and in what order. How the app is built and why is in [`design/full-app.md`](design/full-app.md); every environment variable is in the [README](../README.md#environment-variables).

You need: the Vercel project, the Neon project, the Vercel AI Gateway, and a checkout of this repository with a `.env.local` for the few tasks that run a command.

## 1. First-time setup of a new deployment

1. In Neon, make sure the project has a default branch (production) and a `preview` branch.
2. In the Vercel project, set these environment variables. Set `DATABASE_URL` differently for Production (Neon default branch) and Preview (Neon `preview` branch).

   | Variable | Production | Preview |
   |---|---|---|
   | `DATABASE_URL` | production branch, pooled connection string | `preview` branch, pooled connection string |
   | `AI_GATEWAY_API_KEY` | a key with a monthly budget (section 8) | a separate key with a small budget |
   | `DEBRIEF_MODEL` | for example `anthropic/claude-sonnet-5.5` | same |
   | `REALTIME_MODEL` | optional, defaults to `openai/gpt-realtime-2.1` | same |
   | `SETUP_CODE` | 20 or more random characters, for the first run only | not needed |
   | `CRON_SECRET` | 20 or more random characters | not needed (the job runs only in production) |

3. Deploy `main`. The build migrates the database and loads the scenario library, so a first deployment against an empty database creates every table. Check the build log for `Migrations applied` and `4 library scenarios upserted` (the number is however many scenarios are in `src/scenarios/seed.ts`).
4. Open `https://<your-site>/setup`. Enter the setup code, your name, email, a password (12 to 128 characters) and the first practice's name. This creates you as the service administrator, creates the practice with the library scenarios as drafts, makes you a manager of it and signs you in. If `/setup` shows "not found", either the database already has users or `SETUP_CODE` is missing or shorter than 20 characters.
5. Remove `SETUP_CODE` from the Vercel environment and redeploy. It does nothing once a user exists, but there is no reason to leave it.
6. Run the checks in section 10.

If you do not want yourself to be a manager of the first practice, the first manager can be someone else: from `/admin` add a practice and invite a manager (section 2) and ignore the practice made at setup, or leave it as your own test practice.

## 2. Adding a practice and its first manager

1. Sign in as the service administrator and open **Admin**.
2. Under **Add a practice**, enter the practice name (2 to 120 characters) and save. The practice starts with every active library scenario copied in as a draft. Nobody can sign in to it yet.
3. Open the practice from the list. Under **Invite a manager**, enter the manager's name and work email and make the link.
4. The link (`/invite/<token>`) is shown once, on that page only. Copy it and send it to the manager by whatever channel you trust. It works once and lasts 7 days. It is listed under **Waiting to join** until used, where you can cancel it.
5. The manager opens the link, ticks that they have read the privacy notice, chooses a password and is signed in to their practice. If that email address already has an account on the service, they are asked for that account's current password instead, which is never changed.

If you lose the link before sending it, cancel the invitation and make a new one. Making a new invitation for the same email and practice cancels the earlier one.

## 3. What a manager does next

Tell the manager these steps. All are on their own pages after sign-in.

1. **Invite staff.** Team, then **Invite someone**. Enter name, email, role (trainee or manager), and whether the person can approve scenarios. The app shows a one-time link (7 days). The manager passes it on. A person who is already in the practice cannot be invited again.
2. **Give a clinician the approve permission.** A scenario can only be approved by someone with the "can approve scenarios" permission, who should be a clinician checking against the practice's protocols. Set it when inviting, or on the Team page open the person and use **Approving scenarios**. A manager cannot give the permission to themselves: another manager must. The Scenarios page says who can approve and warns if nobody can.
3. **Get scenarios approved.** On Scenarios, the clinician opens each scenario, reads the answer key, tries the call, then ticks that they have checked it against the practice's protocols and approves. Approval is for exactly that version: any later edit makes the scenario a draft again. Managers and approvers can always try drafts; other staff see only approved scenarios.
4. **Optionally allow drafts.** Settings, **Let staff practise on draft scenarios**. Staff then see unapproved scenarios, with a notice on the call and the debrief saying so. Leave it off until the practice is content.
5. **Set transcript retention.** Settings, **Keep transcripts for**: keep until deleted (the default), 90 days, 180 days, 1 year or 2 years. A daily job then deletes transcripts and the quoted lines in debriefs of calls older than that; scores stay. Shortening the period deletes older transcripts at the next daily run and cannot be undone. This only works if `CRON_SECRET` is set (section 7).
6. **Know where to look.** Reports shows who has practised, results, unsafe outcomes and problems that staff have reported with a debrief (mark each as dealt with). Settings, **Recent changes** shows the last 50 changes to the team, scenarios and settings.

## 4. Helping someone who is locked out

Work out which case it is.

**Too many wrong passwords.** After 8 wrong tries for an email from one network, sign-in is refused for the rest of a 15-minute window. Wait 15 minutes. Nothing to fix.

**Forgotten password, person is only in one practice.** Their manager does it:

1. Team, open the person, **Forgotten password**, **Create a password reset link**.
2. The link is shown once. It works once and lasts 24 hours. Send it to the person. Using it signs them out everywhere and signs them in with the new password.
3. If it was made by mistake, cancel it from **Password reset links not yet used** on the Team page.

**The manager is refused.** A manager may only make a reset link for someone who is an active member of their practice, is not a platform administrator, is not disabled, and has no membership of any other practice, active or deactivated. This stops a manager getting into another practice or the platform by resetting a shared account. If any of that is untrue, the page says the platform administrator must do it.

**Platform administrator makes the link.** Make sure the person asking is who they say they are, by a channel other than the one they are locked out of. Then:

1. Admin, open the practice, **Staff**, **Create a password reset link** on that person's row. This works for any account that is not disabled.
2. Send the link. It works once and lasts 24 hours.
3. **The practice will see this.** The entry "The service administrator created a password reset link for <name>" and, when it is used, "<name> set a new password using a link from the service administrator" appear in **Recent changes** of every practice the person belongs to, including practices where their membership is deactivated. Tell the practice manager if they ask.

**A locked-out platform administrator.** A manager cannot reset an administrator, and another administrator can only do it from a practice the person belongs to. If neither is possible, use the command line, from a terminal on a machine that has the repository and can reach the production database:

1. Put the production `DATABASE_URL` in `.env.local` (or set it in the shell). Take it from Neon, and do not commit it.
2. Run the command with the administrator's email address.

   ```bash
   npm run admin:reset-link -- <email>
   ```

3. It prints a path such as `/invite/<token>` once. Put the site address in front and send that link to the administrator. It works once and lasts 24 hours.
4. The script prints the link only to an interactive terminal. If its output is piped, captured or logged (a CI log, a script) it refuses and creates nothing, because the link is a credential. If you are certain where the output goes, add the flag:

   ```bash
   npm run admin:reset-link -- <email> --print-anyway
   ```

5. The reset is recorded in the audit log with no actor, and shown to the person's practices as above. A disabled account cannot be reset.

Remove the production `DATABASE_URL` from `.env.local` afterwards.

## 5. Suspending a practice

Admin, open the practice, **Suspend this practice** (it asks you to confirm). While suspended, its members cannot use the practice: they are signed in but have no active practice and see a "no access" page; a person who also belongs to an unsuspended practice can switch to it from their account page. Nothing is deleted, and an administrator can still see its usage. Use **Resume this practice** on the same page to restore it. Both are recorded in the audit log and shown to the practice in Recent changes.

A suspended practice's transcripts are still deleted by the daily job if the practice has a retention period.

## 6. Deactivating a person

A manager does this on the Team page (**Deactivate**). The person loses access to that practice, their calls and scores stay, and a manager can reactivate them. A practice must always keep one active manager. There is no way to delete a person or their calls (section 11).

## 7. Rotating secrets

Vercel environment variable changes take effect on the next deployment: redeploy after each change.

**`SETUP_CODE`.** One-time. It works only while the `users` table is empty. Remove it from the Vercel environment after first-run setup. There is nothing to rotate. If you ever set up a fresh, empty database, set a new random value of at least 20 characters first.

**`CRON_SECRET`.** Protects the daily transcript deletion.

1. Generate a new value of at least 20 random characters.
2. Set it as `CRON_SECRET` in the Vercel Production environment and redeploy. Vercel sends the project's `CRON_SECRET` as `Authorization: Bearer <secret>` when it calls the job, so nothing else needs changing.
3. Check it. A request with no secret should answer 401 (secret set) or 503 (secret missing or too short):

   ```bash
   curl -i https://<your-site>/api/cron/retention
   ```

If `CRON_SECRET` is missing or shorter than 20 characters the job refuses to run, and no transcripts are deleted whatever practices have chosen. Setting it is part of going live.

**`AI_GATEWAY_API_KEY`.** Pays for every call and debrief.

1. Create a new key in the Vercel AI Gateway and give it a monthly budget (section 8).
2. Set it in Vercel for Production and Preview, and in your own `.env.local` if you run the evaluation. Redeploy.
3. Make one test call and check the debrief completes (section 10).
4. Revoke the old key.

If a key may have leaked, revoke it first and accept a short outage.

## 8. Controlling cost

Voice calls are the expensive part. The app limits them as follows. All are enforced on the server except the first.

| Limit | Value | Notes |
|---|---|---|
| Call length | 10 minutes, warning at 9 (`MAX_CALL_SECONDS`) | **Done by the call page, not the server.** A modified browser can ignore it. |
| Calls started per person per day | 25 (`DAILY_CALL_LIMIT`) | Per person across all practices, on the London calendar day. Counts calls started whether or not they connected. |
| Voice tokens per call | 3 (the first connection and two reconnections), each valid for 60 seconds | None for a call that has ended or was created over an hour ago. |
| Debrief attempts per call | 3 (the automatic one and two retries) | Each is a text-model call. |
| Transcript size | 400 turns, 4,000 characters a turn, 60,000 in all, and no more than 30 characters a second of connected time plus 600 | Stops absurd transcripts reaching the debrief model; does not stop spending on the voice side. |

What the limits do not cover:

- There is no cap on the number of practices, users or invitations, so total spend grows with use.
- The server cannot end a voice session, only decline to issue more tokens. A modified browser can keep a session open as long as the gateway allows.
- Nothing limits the debrief model's price per call, the evaluation runs (about 1p per assessment) or the voice end-to-end test.
- The numbers on the Admin page (calls and voice minutes, last 30 days and six months) come from the app's own records of connected time. They are for spotting a practice that is using much more than others; they are not a bill.

**Set a monthly budget on the AI Gateway key in Vercel.** It is the one control that holds whatever a client does. Use a separate, smaller-budget key for Preview deployments. Check the Vercel AI Gateway's current documentation for where the budget is set. Look at the gateway's usage page after the first week to learn what a normal month costs.

If you need to cut use quickly, lower `DAILY_CALL_LIMIT` or `MAX_CALL_SECONDS` in the Vercel environment and redeploy, or suspend a practice (section 5).

## 9. Changing models, the prompt, scenarios and the database

### The voice model

1. Set `REALTIME_MODEL` (and, for the voice's behaviour, optionally `REALTIME_TURN_DETECTION` or `REALTIME_PROVIDER_OPTIONS`) in a Preview deployment first.
2. There is no automatic test for the voice. Make a real call on each library scenario with a headset and listen to the voice and the turn-taking. The ten voice names in `src/scenarios/types.ts` were confirmed against `openai/gpt-realtime-2.1` only; a different model may not accept them all.
3. Record what you found in `docs/engineering/voice-findings.md`, with the date.

### The debrief model or prompt

Never change `DEBRIEF_MODEL`, `src/debrief/prompt.ts` or `src/debrief/rubric.ts` without running the evaluation set before and after. The full rule is in [`engineering/debrief-quality.md`](engineering/debrief-quality.md). In short:

1. On the current code, with `AI_GATEWAY_API_KEY` and `DEBRIEF_MODEL` in `.env.local`, run it and keep the summary. A full run is 57 assessments, about 60p and 1.5 minutes.

   ```bash
   npm run eval:debrief -- --runs 3 --json eval-before.json
   ```

2. Make the change. If the prompt wording or the rubric changed, bump `PROMPT_VERSION` in `src/debrief/prompt.ts`; it is stored on every debrief, so old and new can be told apart. A model change alone is recorded on each debrief in `model_used`.
3. Run it again with a different output file, and compare agreement with the expectations and the number of cases where repeated runs disagree.

   ```bash
   npm run eval:debrief -- --runs 3 --json eval-after.json
   ```

4. Record the result as a new column or row in the results table in `docs/engineering/debrief-quality.md` (date, model, prompt version, numbers). If it is worse, fix or revert. Do not change an expectation to get a pass. If you think one is wrong, change it in its own commit with the reason in the case file, then re-read the earlier results without calling the model:

   ```bash
   npm run eval:debrief -- --rescore eval-before.json
   ```

To run one case: `npm run eval:debrief -- --case <name>`. Case names are the file names in `evals/debrief/cases/` without `.json`.

If a change to a library scenario's answer key could alter how it is scored, run the evaluation too: the cases use the library text from `src/scenarios/seed.ts`.

### Adding or changing a library scenario

Edit [`src/scenarios/seed.ts`](../src/scenarios/seed.ts) only, plus `src/scenarios/seed.test.ts`, which lists the scenario ids and voices and must be updated to match. The fields are checked when the build seeds the database, so a scenario that does not fit the schema fails the build.

| Field | Meaning |
|---|---|
| `id` | Permanent slug: lower case letters, digits and hyphens. Practices' copies and past calls refer to it. Do not change it; a changed id is a new scenario and the old one is hidden. |
| `title`, `difficulty` | Shown on the list (`easy`, `medium` or `hard`). Keep the title from giving the answer away. |
| `persona` | Invented name, age (16 to 110) and a line of character. |
| `voice` | One of `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`. The practice lead chose `ballad` for male callers and `coral` for female callers. |
| `openingLine`, `presentingStory` | The caller's first words, and what they say unprompted. |
| `hiddenFacts` | One to twenty facts the caller only says if asked, each with `fact` and `unlockedBy` (the kind of question that brings it out). |
| `emotionalState` | How the caller feels and how handling changes it. |
| `correctOutcome`, `acceptableAlternatives` | The answer key. Never sent to the caller's browser. |
| `redFlags` | Leave empty if there is none; the red flag rubric item is then not applicable. |
| `unsafeOutcomes` | What counts as unsafe. The first is shown on the debrief's unsafe banner. |
| `active` | `false` hides it from the library. |

Never put real patient details in a scenario. All callers are invented.

Then open a pull request. The sync runs on every build (`npm run db:seed`), and on your machine with that command.

**What happens to practices that already have the scenario.** Nothing. The sync only writes the shared library table. A practice's own copy is a separate row, copied when the practice was created or when it added the scenario from the library, and it keeps that text, its revision and its approval until someone at the practice edits it. So:

- A changed library scenario reaches only practices created afterwards, and practices that do not yet have it and add it from "Add from the library".
- A practice that already has the scenario cannot add it again, so it does not receive your change. To give existing practices a revised version, publish it as a new library scenario with a new `id`. It appears under "Add from the library" in every practice; they add it, get it approved, and hide the old copy. If a clinician wants the old copy corrected in place, they edit it at the practice, which makes it a draft until re-approved.
- Removing a scenario from the file hides it in the library (`active = false`) so it is no longer offered; copies already made and past calls are unaffected. It is never deleted.
- A new library scenario appears under "Add from the library" for every existing practice; nothing is added to their staff-facing list until they add and approve it.

### Database migrations

1. Edit `src/db/schema.ts`.
2. Generate the migration. This writes a new SQL file, a snapshot and a journal entry under `drizzle/`.

   ```bash
   npm run db:generate
   ```

3. Read the generated SQL. Commit the SQL file, the snapshot and the journal change together with the schema change.
4. `npm test` runs every migration on an in-process Postgres, so a migration that does not apply fails CI.
5. A pull request's preview build runs `npm run db:migrate` against the Neon `preview` branch; merging to `main` runs it against production during the build. You can also apply migrations by hand to the database in `.env.local`:

   ```bash
   npm run db:migrate
   ```

Things to know:

- **No transactions.** The database driver (`neon-http`) has none. The migrator runs a migration's statements one at a time and, with the installed version of drizzle-orm, records the applied migrations only after all pending ones have run. A failure part-way leaves earlier statements applied and unrecorded, and a second run will try them again and may fail on "already exists". Fix such a database by hand, in SQL, before redeploying. Keep migrations small and additive.
- **The database changes before the code does.** A migration runs during the build, before the new deployment is live, and a rollback of code does not undo it. Make each migration safe for the previous release: add columns as nullable or with defaults, and remove a column in a later release than the code that stopped using it.
- **The preview branch is shared.** Two open pull requests that both add migrations can leave the preview database in a state that matches neither. If a preview build behaves strangely after another pull request's migration, reset the Neon `preview` branch from its parent.

## 10. What to check after a deploy

1. In the Vercel build log: `Migrations applied` and `<n> library scenarios upserted`, and the build finished.
2. The site answers and sends its security headers. Look for `content-security-policy` (with a nonce) and `strict-transport-security`:

   ```bash
   curl -sI https://<your-site>/sign-in
   ```

3. The retention job is protected: this should answer 401, not 503 (503 means `CRON_SECRET` is missing):

   ```bash
   curl -i https://<your-site>/api/cron/retention
   ```

4. Sign in as the administrator and open **Admin**: the practices list loads.
5. After a deploy that touched the call, the debrief, sign-in or the database: sign in as a manager of a test practice, start a call on an approved scenario (or a draft, as a manager), speak for at least 20 seconds, hang up, and check the debrief appears. This is the only check that exercises the voice connection, the gateway key and the debrief model together.
6. The day after the first production deploy, check in Vercel's cron logs that `/api/cron/retention` ran and answered 200 (it answers with the number of calls it cleared).

## 11. When something goes wrong

**Where to look**

- **Vercel runtime logs** for the production project. The app logs these lines when something fails: `Debrief failed`, `Realtime token mint failed`, `Transcript retention job failed`. Filter on them. Do not paste logs that contain one-time links.
- **The audit log.** Managers see the last 50 entries for their practice under Settings, **Recent changes**. The full record is the `audit_log` table in Neon, which keeps everything, including entries for changes made from the command line (no actor).
- **Neon.** The SQL editor on the right branch shows the data. Be careful on production.

**A debrief failed or never appeared**

1. The call shows "Debrief failed". The trainee can press **Try the debrief again** twice (three attempts in all). Their transcript is kept. After three attempts, they start a new call.
2. Find the cause in the runtime logs at the time of the call, under `Debrief failed`. Common causes: `DEBRIEF_MODEL is not set`; the gateway key is wrong, out of budget or revoked; the model name is not valid for the gateway; the model's answer did not fit the expected shape.
3. A call showing "Debrief being prepared" for more than a few minutes had its request cut off (the end-of-call route allows 120 seconds), and nothing retries it. Find such calls in Neon:

   ```sql
   select id, started_at, ended_at from sessions where status = 'debriefing' and ended_at < now() - interval '10 minutes';
   ```

   To let the trainee retry one, set it to failed (their retry button appears; attempts left permitting). Do this on production only after checking the id:

   ```sql
   update sessions set status = 'failed' where id = '<session id>' and status = 'debriefing';
   ```

4. If a call says it could not be saved because the transcript is longer than could have been said, the browser reported more text than the connected time allows. The call stays open and the trainee can start a new one. If it happens to honest users, check the server clock assumptions in section 7 of the design.

**A call will not start**

- "You have started 25 calls today": the daily limit; it resets at midnight London time. Raise `DAILY_CALL_LIMIT` only if that is intended.
- "This call cannot be reconnected again" or "set up more than an hour ago": the 3-token or 60-minute limit for that call. Start a new call.
- "Could not start the call" (a 502 on the token route): the gateway refused to mint a token. Look for `Realtime token mint failed` in the logs: key, budget or model.
- A practice firewall blocking `wss://ai-gateway.vercel.sh`: the call connects to nothing. Test from another network.
- The person sees "no access": their membership is deactivated or their practice is suspended.

**Sign-in problems:** section 4. A genuine user locked out by throttling just waits 15 minutes.

**The daily retention job failed or did not run**

1. In Vercel's cron logs for `/api/cron/retention`, read the response. 503: `CRON_SECRET` is missing or under 20 characters. 401: the secret Vercel sent does not match; the Production variable changed without a redeploy. 500: look for `Transcript retention job failed` in the runtime logs (usually the database).
2. The job is safe to run again at any time. Each step is repeatable and the call is marked last, so a failed run is finished by the next one. To run it now with the real secret in an environment variable (this deletes expired transcripts for real):

   ```bash
   curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<your-site>/api/cron/retention
   ```

   It answers `{"sessions":<n>}`, the number of calls cleared.
3. Cron jobs run on the production deployment only. They do not run on previews.

**A request to delete one person's data.** There is no supported way. Retention deletes transcripts and quoted lines by age, not by person, and leaves scores, accounts and the audit log. Deactivating a member stops access but keeps their calls. Any other deletion is manual work in the database by a maintainer, and should be agreed with the practice first. The privacy notice at `/privacy` tells staff to ask their practice manager, who in turn has to ask you, so agree who answers such requests and how.
