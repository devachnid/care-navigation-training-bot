# Care Navigation Call Practice: design

Status: built (build started and brought in line with the code on 15 November 2026). Nothing in the repository records that a clinician has checked the library scenarios' answer keys or the debrief evaluation set's expectations. This is the maintainers' reference for how the app is put together and why; where it and the code differ, the code is right and this document is wrong. The PoC brief it grew from is in `docs/archive/`.

## 1. What the product is

GP reception staff practise care-navigation phone calls against a simulated caller, then get a scored debrief. The PoC proved the call and the debrief. This version makes it something several practices can run properly:

- Real accounts instead of a shared code and a typed name.
- Practices as tenants. A practice's staff, calls, scores and scenarios are visible only inside that practice.
- Managers who invite staff and see how their team is doing.
- Scenarios each practice owns, edits and has a clinician approve against its own protocols.
- A platform admin who sets up practices.
- Transcripts that each practice can have deleted automatically after a period it chooses.
- Limits on calls, voice tokens and debrief retries, and throttling on sign-in.

Deliberately not in this version: Welsh language, billing, single sign-on, email sending, audio storage, assignments and deadlines. None of the design below blocks adding them.

## 2. People and what they can do

| Who | How they are represented | Can |
|---|---|---|
| Trainee | membership `role = 'trainee'` | take calls; see their own debriefs, history and progress |
| Manager | membership `role = 'manager'` | everything a trainee can; invite and manage staff; see every call, debrief and report in the practice; manage scenarios; change practice settings |
| Clinician approver | membership `can_approve_scenarios = true` (on a trainee or a manager) | view and edit scenarios including answer keys; approve them; take calls on draft scenarios |
| Platform admin | `users.is_platform_admin = true` | create and suspend practices; invite a practice's manager; make a password reset link for any account that is not disabled; see usage per practice (counts of calls and voice minutes only) |

A user can belong to more than one practice. They act in one practice at a time (the "active practice" on their sign-in session).

Abilities are checked by one pure function, `can(actor, ability)` in `src/policy/can.ts`:

| Ability | Granted to |
|---|---|
| `calls.take` | any active member of an unsuspended practice |
| `sessions.viewOwn` | any active member |
| `sessions.viewPractice` | manager |
| `team.manage` | manager |
| `reports.view` | manager |
| `scenarios.manage` | manager, or approver |
| `scenarios.approve` | approver |
| `scenarios.useDrafts` | manager, or approver |
| `practice.settings` | manager |
| `platform.admin` | platform admin |

Platform admin does not imply any practice ability. An admin who needs to see inside a practice is given a membership like anyone else, so access to practice data is always explicit and visible in the team list. The admin pages (`src/admin/dal.ts`) return names, states, people and counts only: never a transcript, debrief, score or scenario text, and nothing that says who made which call.

## 3. Architecture rules

These are the rules that keep tenants apart and the code maintainable. Code review holds to them.

1. **One way in to the database.** Only data-access modules (`src/**/dal.ts`, `src/**/*-dal.ts`, never under `src/app`), `src/auth/*`, `src/db/*`, `src/audit/*` and tests may import `@/db/client`. Database drivers are used only in `src/db` and `src/test`. Pages, server actions and route handlers call data-access functions. A local ESLint rule (`eslint-rules/db-access.mjs`) enforces this on the resolved path, and `src/test/lint-guard.test.ts` tests the rule.
2. **Every data-access function that touches practice data takes an `Actor`** and puts `actor.membership.practiceId` in the SQL `WHERE`. It never accepts a practice id from the request. Looking up another practice's row returns "not found", never "forbidden". Two kinds of function are outside this rule on purpose: platform-admin functions (`src/admin/dal.ts`, and `createManagerInvitation` and `createResetLinkAsPlatformAdmin` in `src/auth/invitations.ts`), which assert `platform.admin` and may take a practice or user id, and the system job that deletes expired transcripts (`src/sessions/retention-dal.ts`), which takes no actor and is reached only from the cron route.
3. **Every server action and route handler starts by resolving the actor and checking an ability.** A check on the page does not protect the action behind it. The one exception is the cron route, which is not signed-in and is guarded by `CRON_SECRET` (section 9a).
4. **No database transactions.** The driver is `drizzle-orm/neon-http`, which has none. Multi-step writes are ordered so that a failure part-way leaves nothing dangerous, and one-time things (invitation tokens) are claimed with a single `UPDATE ... WHERE used_at IS NULL ... RETURNING`.
5. **A call is judged against the scenario as it was when the call started.** `sessions.scenario_snapshot` holds it. Later edits to a scenario never change an old debrief.
6. **The caller model and the assessor model stay separate.** `src/patient/*` never sees the answer key; `src/debrief/*` never role-plays. Neither imports the other.
7. **No audio is stored. No analytics, third-party scripts or external assets.**
8. **Things that change who can see or do what are written to `audit_log`.** Managers read their practice's entries as "Recent changes" on the settings page (section 6).

Next.js 16 conventions that differ from older versions are summarised in `docs/engineering/next16-notes.md`. `AGENTS.md` requires reading the bundled docs before writing Next code.

## 4. Data model

SQL names are snake_case; Drizzle properties are camelCase. All ids are `uuid` with `defaultRandom()` unless stated. All timestamps are `timestamptz`.

### Accounts

**`users`**: `id`, `email` (unique; stored trimmed and lower-cased, enforced by a check constraint), `name`, `password_hash` (null until set), `is_platform_admin` (default false), `privacy_ack_at` (null until they accept the notice), `created_at`, `last_sign_in_at`, `disabled_at`. Nothing in the app sets `disabled_at`; it exists so an account can be disabled by hand in the database, and a disabled user cannot sign in, has no session and cannot be given a reset link.

**`auth_sessions`**: `id`, `token_hash` (unique; SHA-256 of the cookie token), `user_id` → users (cascade), `active_practice_id` → practices (set null), `created_at`, `expires_at`. Index on `user_id`.

**`auth_throttle`**: `key` (text, primary key: `pair:<email>|<ip>`, `email:<email>`, `ip:<ip>` or `setup`), `count`, `window_started_at`. Rows whose window ended more than a day ago are deleted whenever an attempt is counted.

**`invitations`** (also used for password resets): `id`, `kind` (`'invite' | 'reset'`), `token_hash` (unique), `practice_id` → practices (the practice joined, for an invite; for a reset, the practice whose manager made it, and null when a platform admin or the command line made it), `email`, `name`, `role` (null for a reset), `can_approve_scenarios` (default false), `user_id` → users (the account a reset is for; null for an invite), `created_by` → users (null only for links made from the command line), `created_at`, `expires_at`, `used_at`, `revoked_at`. Check constraints: `kind` is one of the two, and an invite has a practice, a role and no user while a reset has a user and no role. Index on `practice_id`.

### Practices

**`practices`**: `id`, `name`, `created_at`, `suspended_at`, `allow_draft_scenarios` (default false), `transcript_retention_days` (null means keep).

**`memberships`**: `id`, `practice_id` → practices, `user_id` → users, `role` (`'trainee' | 'manager'`, checked), `can_approve_scenarios` (default false), `created_at`, `deactivated_at`. Unique `(practice_id, user_id)`; index on `user_id`.

### Scenarios

**`scenarios`** is the shared **library**: templates maintained in `src/scenarios/seed.ts` and synced on deploy. Text slug primary key (`id`), the content columns below, `active`. The old `clinician_approved` column is dropped; approval belongs to a practice.

**`practice_scenarios`** are what staff actually call. Each practice owns its copies and may write its own: `id`, `practice_id` → practices (not null), `library_scenario_id` → scenarios.id (text, null for a practice-written scenario), `revision` (int, starts at 1), the same content columns as the library (`title`, `difficulty`, `persona`, `voice`, `opening_line`, `presenting_story`, `hidden_facts`, `emotional_state`, `correct_outcome`, `acceptable_alternatives`, `red_flags`, `unsafe_outcomes`), `active`, `approved_revision`, `approved_by` → users, `approved_at`, `created_at`, `updated_at`, `updated_by` → users. Unique `(practice_id, library_scenario_id)`.

- The content columns are `title`, `difficulty` (`easy`, `medium` or `hard`), `persona` (jsonb: name, age, description), `voice` (one of the ten voices in `src/scenarios/types.ts`, default `ballad`), `opening_line`, `presenting_story`, `hidden_facts` (jsonb array of `{fact, unlockedBy}`), `emotional_state`, `correct_outcome`, `acceptable_alternatives`, `red_flags` and `unsafe_outcomes` (jsonb arrays of text; an empty `red_flags` means the scenario has no red flag).
- A scenario is **approved** when `approved_revision = revision`.
- Any change to content adds one to `revision`, which makes it a draft again. Switching `active` does not. Approving records the revision reviewed, and fails if the scenario has been edited since.
- A manager cannot make themselves a clinician approver; another manager must. For a practice whose only manager is its clinician, the permission is given when the account is made: a tick box at first-run setup, and on the platform admin's "Invite a manager" form.
- When a practice is created, every active library scenario is copied into it as a draft. A library scenario added later appears on the practice's scenario page as "available to add".
- **The library sync never changes a practice's copy.** `npm run db:seed` upserts the `scenarios` table from the seed file and hides (`active = false`) library rows that are no longer in the file. It does not touch `practice_scenarios`. A practice's copy keeps the text it was copied with until someone at the practice edits it. A changed library scenario therefore reaches only practices created afterwards and practices that add it from the library after the change (and only if they do not already have it). A scenario removed from the file stops being offered under "available to add"; copies already made, and past calls, are unaffected.
- Trainees see a scenario when it is active and either approved or the practice has `allow_draft_scenarios`. Managers and approvers always see active drafts so they can test them.

### Calls

**`sessions`**: `id`, `trainee_name` and `scenario_id` → scenarios (both nullable and legacy: rows from the PoC have them and nothing else, belong to no practice, and are not shown anywhere), `practice_id` → practices, `user_id` → users, `practice_scenario_id` → practice_scenarios, `scenario_snapshot` (jsonb: the scenario content plus `practiceScenarioId`, `libraryScenarioId`, `revision`, `approved`), `started_at` (when the call was created, default now), `ended_at`, `duration_seconds`, `status` (`created`, `in_call`, `debriefing`, `complete`, `too_short` or `failed`; default `created`), `token_mints` (voice tokens issued, default 0), `connected_at` (server time of the first voice token; null until then), `debrief_attempts` (default 0), `transcript_deleted_at` (null while the transcript is kept). Indexes on `(practice_id, started_at)` and `(user_id, started_at)`.

**`transcript_turns`**: `id`, `session_id` → sessions (cascade), `speaker` (`trainee` or `patient`), `text`, `sequence`. Unique `(session_id, sequence)`.

**`debriefs`**: `id`, `session_id` → sessions (unique, cascade), `overall_score` (0 to 100), `outcome_correct`, `unsafe_outcome` (default false), `red_flag_handled` (null when the scenario has no red flag), `rubric_scores` (jsonb; null when the call was too short to assess), `strengths` and `improvements` (jsonb arrays of `{point, quote}`), `quoted_moments` (jsonb array of the quotes), `model_used`, `prompt_version` (null for PoC rows and calls too short to assess).

**`debrief_flags`** (a trainee's or manager's "report a problem with this debrief"): `id`, `session_id` → sessions (cascade), `practice_id` → practices, `user_id` → users, `reason` (1 to 500 characters), `created_at`, `resolved_at`, `resolved_by` → users. A person has at most one open report per debrief.

**`audit_log`**: `id`, `at` (default now), `actor_user_id`, `practice_id`, `action` (e.g. `member.invited`, `scenario.approved`), `target_type`, `target_id` (text), `detail` (jsonb). Append-only, with no foreign keys so entries outlive what they describe. Index on `(practice_id, at)`. `actor_user_id` is null for changes made from the command line and for the retention job.

Migrations are in `drizzle/` (six so far, `0000` to `0005`), generated from `src/db/schema.ts` by `npm run db:generate` and applied by `npm run db:migrate`.

## 5. Sign-in

Built in-house, small and fully tested, because the alternatives did not fit (no email sending, invitations for people with no account yet, no transactions). `src/auth/` holds all of it.

- **Passwords:** scrypt from `node:crypto` (N=2^17, r=8, p=1, 64-byte key, 16-byte random salt), stored as `scrypt$N$r$p$salt$hash` so parameters can change later. Hashes made with older parameters still verify and are replaced at the current cost on the next successful sign-in. Compared with `timingSafeEqual`. 12 to 128 characters; must not contain the user's email name or be on a short built-in list of obvious passwords.
- **Sessions:** a 32-byte random token in an `httpOnly`, `sameSite=lax`, `secure` cookie (named `__Host-cn_session` in production, `cn_session` in development). Only its SHA-256 is stored. A session lasts 12 hours from sign-in and is not extended, because reception desktops are shared. A new token is issued on every sign-in. Expired sessions of a user are deleted when they next sign in. Changing a password deletes the user's other sessions; using a reset link deletes all of them.
- **Who is asking:** `getActor()` (returns `Actor | null`) and `requireActor()` (redirects to `/sign-in`) in `src/auth/current.ts`, wrapped in React `cache()`. They load the session, the user and the active membership in one query and treat a disabled user, a deactivated membership or a suspended practice as not signed in to that practice.
- **Throttling:** every sign-in attempt is counted in `auth_throttle` before the password is checked (one atomic upsert per key, so racing requests cannot get past the limit): 8 per email and IP together in 15 minutes (`pair:` keys; per email alone when there is no IP), a backstop of 100 per email whatever the IP (`email:`), and 30 per IP whatever the email (`ip:`). Over a limit, sign-in is refused until that key's 15-minute window ends, with the same message as a wrong password (which tells the person to wait 15 minutes). A correct password clears the email-and-IP count and gives its attempt back on the per-email and per-IP counts, so only failures build up there and a whole practice signing in from one public address at the start of a shift does not lock itself out. The IP comes from the platform's own header (`x-vercel-forwarded-for`, then `x-real-ip`), and only then from the first `x-forwarded-for` entry, which a client can forge. The same check, with the same counts, is used when an existing account joins a practice from an invitation and when a signed-in user changes their password (checking the current one).
- **No user enumeration:** one message for unknown email, wrong password, disabled account. An unknown email still costs one scrypt.
- **Cross-site requests:** server actions are origin-checked by Next. The two JSON route handlers check that `Origin` matches the request host (`src/auth/origin.ts`).
- **First run:** `/setup` works only while `users` is empty and `SETUP_CODE` is set to at least 20 characters; otherwise the page is a 404. Attempts are throttled under one fixed key (`setup`: 5 in 15 minutes, all callers together), counted before the code is compared. The admin row is inserted by one statement guarded by an advisory lock and `NOT EXISTS (users)`, so two simultaneous setups cannot both succeed. It creates the platform admin, the first practice (with the library copied in as drafts) and that person's manager membership, and signs them in. Once any user exists the code does nothing, so it is one-time; it should be removed from the environment afterwards.
- **Invitations:** a manager fills in name, email, role and whether the person can approve scenarios. The app shows a link, `/invite/<token>`, once; only the token's SHA-256 is stored. The manager passes it on however they like. It lasts 7 days. Rules as implemented (`src/auth/invitations.ts`):
  - Creating an invitation never adds anyone. It is refused only if that email is already in this practice (active or deactivated), and it says nothing about whether the email has an account elsewhere, so a manager learns nothing about other practices.
  - Making a new invitation for the same email and practice cancels any earlier unused one.
  - The invitee must tick the privacy notice. For a new email they set a password (12 to 128 characters, same rules as everywhere). If the email already has an account with a password, they enter that account's current password to join; it is checked like a sign-in (same throttle), never changed, and a wrong password does not use up the link.
  - The person who made the invitation must still be an active manager of that practice (or a platform admin), and not disabled, when the link is used. Demoting or deactivating a manager cancels the unused invitations and reset links they made.
  - A platform admin invites a practice's manager with the same mechanism, role fixed to manager.
  - The link is claimed with one `UPDATE ... WHERE used_at IS NULL ... RETURNING`. Everything is checked before the claim; if a later step fails the link is spent and a new one is needed.
- **Forgotten passwords:** a manager creates a reset link (24 hours) for a member of their practice. To stop this being a way into other practices or the platform, a manager may only do this for someone who is an active member of their practice, is not a platform admin, is not disabled, and has no membership of any other practice, active or deactivated (a deactivated one can be reactivated later); otherwise a platform admin does it. The rule is checked again when the link is used. Only the newest reset link for an account works. Using a link sets the new password, signs the person out everywhere and starts a new session; the privacy notice is asked for only if they never accepted it.
  - A platform admin can make a reset link for any account that is not disabled (from the practice's page under Admin).
  - A locked-out platform admin, or anyone with database access, uses `npm run admin:reset-link -- <email>`. It prints the link path once and only to an interactive terminal; it refuses when output is piped or logged unless `--print-anyway` is given. It cannot run inside the web app.
  - **The practice sees administrator resets.** A link made by a platform admin or from the command line is written to the audit log as `reset_link.admin_created`, once for every practice the person has a membership in (active or deactivated), or once with no practice if they have none; using it writes `password.admin_reset` the same way. Both appear in each practice's "Recent changes" as "The service administrator created a password reset link for ..." and "... set a new password using a link from the service administrator". A manager's own link writes `reset_link.created` and `password.reset` in that practice only.

`Actor`:

```ts
export type Actor = {
  userId: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  membership: {
    practiceId: string;
    practiceName: string;
    role: 'trainee' | 'manager';
    canApproveScenarios: boolean;
  } | null;
};
```

## 6. Screens

| Path | Who | What |
|---|---|---|
| `/sign-in`, `/invite/[token]`, `/setup`, `/privacy` | anyone | sign in; accept an invitation or reset a password; first-run setup; privacy notice |
| `/` | member | scenarios available to you, with your attempts, best score and last result |
| `/call/[sessionId]` | the caller | the call |
| `/debrief/[sessionId]` | the caller, or a manager of the practice | debrief and transcript; "report a problem with this debrief" |
| `/history` | member | your calls |
| `/account` | signed in | name, change password, switch practice |
| `/team`, `/team/[userId]` | manager | staff, invitations, reset links, roles, deactivate; one person's calls |
| `/reports`, `/reports/export` | manager | practice dashboard (including unsafe outcomes and reported debrief problems, which a manager marks as dealt with); CSV download |
| `/scenarios`, `/scenarios/new`, `/scenarios/[id]` | manager or approver | list with approval state; write; edit, test, approve; add from library |
| `/settings` | manager | practice name, draft scenarios on or off, transcript retention; "Recent changes" (the last 50 audit entries for the practice, worded as sentences) |
| `/no-access` | signed in, no active practice | says access has ended; sign out |
| `/api/sessions/[sessionId]/token`, `/api/sessions/[sessionId]/end` | the caller | mint a voice token; save the transcript and run the debrief (JSON, origin-checked) |
| `/api/cron/retention` | Vercel cron only | deletes expired transcripts (section 9a) |
| `/styleguide` | development only | component reference; a 404 in production |
| `/admin`, `/admin/practices/[id]` | platform admin | practices, usage, add a practice, suspend or resume, invite or cancel a manager invitation, make a password reset link for anyone in the practice |

The interface is plain and large, for reception desktops with a headset: British English, short sentences, WCAG 2.2 AA, no external assets. Shared components live in `src/ui/`.

## 7. Limits

All are enforced on the server unless a line says the page does it. Numbers are constants in `src/sessions/dal.ts` unless an environment variable is named.

- A call is hung up automatically at 10 minutes, with a warning at 9 (`MAX_CALL_SECONDS`, default 600; the warning is 60 seconds before). **The page does this, not the server** (section 7a).
- A user can start 25 calls a day (`DAILY_CALL_LIMIT`, default 25), counted per user across all their practices on the Europe/London calendar day, and counting calls that were started whether or not they connected. The count and the insert are one statement. A value that is not a positive whole number falls back to the default.
- A voice token lives 60 seconds. At most 3 voice tokens per call (the first connection and two reconnections), none for a call that has ended, and none more than 60 minutes after the call was created. The first token moves the call to `in_call` and records `connected_at` (server time). One `UPDATE` does the check and the count.
- A call is debriefed only if its voice connection opened. Ending a call that never connected records it as a fail with a score of 0, and keeps no transcript.
- A call under 20 seconds, or where the trainee never spoke, is a fail with a score of 0 and no debrief is run. The duration stored is the server's connected time, capped by the browser's figure.
- **Transcript plausibility.** The browser reports the transcript, so for a connected call its length is checked against the server's clock: more than 30 characters for each second since `connected_at`, plus 600, is refused ("the transcript is longer than could have been said"), nothing is saved, and the call stays open. The browser's own duration is never used to allow more text. Other limits on the body: at most 400 turns, 4,000 characters a turn, 60,000 characters in all, a duration of at most 3,600 seconds. (A call connected before `connected_at` existed is judged from when it was created.)
- A debrief run is attempted 3 times at most: the automatic one and two retries by the trainee. No retry is possible once the call's transcript has been deleted. The debrief model is asked for two or three strengths and improvements; the schema accepts up to eight of each so a long answer does not fail the debrief, and the code keeps the first three.
- Sign-in throttling, and the setup throttle: section 5.
- Transcript retention: section 9a.

## 7a. Known limits of this version

These come from one design choice inherited from the proof of concept: the trainee's browser holds the voice connection. Evidence is in `docs/engineering/voice-findings.md`. The fix for all three is the same piece of future work, relaying the voice connection through our own server, and it is the first thing to do if scores start to matter for anything beyond practice.

1. **A score is only as trustworthy as the transcript, and the browser reports the transcript.** A trainee who wanted to could submit a transcript they wrote. Scores are for learning, not for assessment or appraisal, and a manager can read the transcript behind a score (until the practice's retention period deletes it). The server refuses transcripts that are implausibly long for the time the call was connected, and the assessor is given the transcript as data, but neither stops a determined cheat.
2. **The caller's prompt, including the hidden facts, is visible in the trainee's browser** to someone who opens developer tools. The answer key is not.
3. **The server cannot end a voice session.** It limits how many voice tokens can be minted (3 per call, 25 calls a day per person, each token valid for 60 seconds), which limits how many sessions can be opened, but it cannot close one or cap how long one runs. The 10-minute hang-up is done by the page. Set a monthly budget on the AI Gateway key so a misbehaving client cannot run up a bill.

Smaller accepted trade-offs:

- A manager who invites an email address can tell from the link whether that address already has an account on the service.
- One-time links carry their token in the URL path, so an unused link is in the host's request logs. Links expire (7 days for invitations, 24 hours for resets) and work once.
- Anyone who knows an email address can lock it out of sign-in for the rest of a 15-minute window, but only by getting past the per-email backstop: more than 100 wrong guesses from any mix of networks. Wrong guesses from one network lock only that network's attempts for that email (8) and then that network altogether (30 in total).
- There is no screen or command to delete one person's data or one call. Retention (section 9a) is the only deletion, and it removes transcripts and quoted lines, not scores, rubric reasons, accounts or audit entries. Deactivating someone keeps their calls.
- The transcript is saved and the debrief is run in one request with no transaction (rule 4). If the debrief model call fails, the call is marked `failed` with its transcript saved and the trainee can retry (section 7). If the request itself is cut off (for example it runs past the 120-second limit of the end route), the call stays in `debriefing`; five minutes after the call ended it counts as failed and the person who made it can retry it from the debrief page.
- The debrief is an AI judgement against the answer key. The same call can score a little differently on different runs (`docs/engineering/debrief-quality.md` measures how much), and the evaluation set's expectations were written by one engineer and have not been checked by a clinician or a practice manager. The library scenarios' answer keys are drafts until a clinician at each practice approves them.
- The practice network has not been tested: the voice connection is a WebSocket to `ai-gateway.vercel.sh`, which a practice firewall may block.

## 8. Code layout

```
src/db/          schema, client (the Db type and getDb), migrate, library seed
src/auth/        passwords, tokens, sessions, throttle, current actor, invitations, setup, client IP, origin check
src/policy/      Actor type, can(), Result helpers
src/practices/   practices, memberships, team, settings
src/scenarios/   scenario types, library (seed.ts), practice scenarios, approval
src/sessions/    starting, ending, reading calls; progress; transcript retention
src/patient/     caller prompt and voice session config
src/call/        browser call hook, transcript assembly, call clock
src/debrief/     rubric, assessor prompt, assessment, run, quote checking, problem reports
src/reports/     dashboard queries, CSV
src/admin/       platform admin queries
src/audit/       audit log writer, reader, sentence wording
src/ui/          shared components and app shell
src/app/         routes: (public), (app), (call), api
src/proxy.ts     Content-Security-Policy with a nonce (section 9b)
scripts/         admin-reset-link.ts (command-line password reset)
evals/debrief/   evaluation set and runner for the assessor
drizzle/         generated SQL migrations
eslint-rules/    the local rule behind architecture rule 1
```

## 9. Tests, checks and environments

**Tests sit beside the code as `*.test.ts`** (and under `evals/`). Pure logic has unit tests. Data-access modules have integration tests that run the real migrations against an in-process Postgres (PGlite), so tenancy rules are tested for real with no network. `npm test` runs all of these and needs no network, database or keys.

**CI** (`.github/workflows/ci.yml`, on every pull request and push to `main`, Node 22) runs `npm run lint`, `npm run typecheck`, `npm test` and `npx next build`. The last compiles only: `npm run build` also migrates and seeds a database, which CI must never do.

**Debrief evaluation set.** `evals/debrief/` holds 19 hand-written transcripts with expected scores and flags, and a runner (`npm run eval:debrief`) that calls the real assessor path through the AI Gateway. It costs money and is never run by `npm test` or CI. The rule for changing the rubric, the assessor prompt or `DEBRIEF_MODEL` (run it before and after, record the result) and the results so far are in `docs/engineering/debrief-quality.md`. The assessor's prompt version is stored on every debrief (`debriefs.prompt_version`).

**End-to-end suite.** A browser test suite that drives the real app, and a separate voice end-to-end test that makes a real call against the gateway, are documented in `e2e/README.md`. They are opt-in: they need a running app and a database, and the voice test needs a gateway key and costs money.

**Environments**

- `main` is production. Work happens on branches and reaches production by pull request. Each pull request gets a preview deployment.
- Production uses the Neon default branch. Preview deployments and local development use the Neon `preview` branch. The build (`npm run build`) runs `db:migrate` and `db:seed` against whichever database its environment's `DATABASE_URL` points at, then `next build`. A migration therefore reaches a database before the code that needs it is live, and a rollback of code does not roll back the database, so migrations must leave the previous release working.
- `vercel.json` runs server functions in London (`lhr1`) and schedules the retention job.

**Environment variables** (the README has the full table, with where each is used): `AI_GATEWAY_API_KEY`, `DATABASE_URL`, `SETUP_CODE`, `CRON_SECRET`, `REALTIME_MODEL`, `DEBRIEF_MODEL`, and optionally `REALTIME_TURN_DETECTION`, `REALTIME_PROVIDER_OPTIONS`, `MAX_CALL_SECONDS`, `DAILY_CALL_LIMIT`. `ACCESS_CODE` is retired.

## 9a. Transcript retention and the daily job

A practice's manager chooses how long transcripts are kept on `/settings`: keep until deleted (the default, `transcript_retention_days` null), 90 days, 180 days, 1 year or 2 years (the data layer accepts 7 to 3,650 days). `vercel.json` schedules `/api/cron/retention` daily at 03:20 UTC. Vercel calls it with `Authorization: Bearer <CRON_SECRET>`; the route answers 503 if `CRON_SECRET` is missing or under 20 characters (so retention does nothing until it is set) and 401 for a wrong secret, and compares in constant time. Vercel runs cron jobs only on the production deployment.

`deleteExpiredTranscripts` (`src/sessions/retention-dal.ts`) handles each practice that has a period set, and each of its calls that is finished (`complete`, `too_short` or `failed`), ended more than that many days ago and is not yet marked. For those calls, in chunks of 200, it:

1. deletes the transcript turns;
2. empties `strengths`, `improvements` and `quoted_moments` on the debrief (the written feedback points and their quotes);
3. deletes reports of problems with that debrief (`debrief_flags`);
4. sets `sessions.transcript_deleted_at`, last.

Scores, the outcome flags, the rubric scores with their one-line reasons, the scenario snapshot, the call's times and the user's account stay. The mark goes last, so a failure part-way leaves the call unmarked and the next run repeats every step, each of which is safe to repeat. Calls in progress, calls with no practice and practices that keep transcripts are never touched. One `transcripts.expired` audit entry per practice affected, with no actor. Afterwards the debrief page says the transcript was deleted; such a call cannot be given a debrief retry or have a problem reported. Shortening the period deletes older transcripts at the next daily run; a deleted transcript cannot be recovered.

## 9b. Security headers and the Content-Security-Policy

Static headers are set in `next.config.ts` for every path: `Strict-Transport-Security` (two years, including subdomains), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` (invitation links carry a secret in the path), `X-Frame-Options: DENY`, and a `Permissions-Policy` that allows the microphone to this site only and refuses camera, geolocation, payment, USB and the other listed features. `/invite/*` and `/setup` also get `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

The `Content-Security-Policy` is set in `src/proxy.ts` (the Next 16 name for middleware), with a fresh nonce for every page request: `default-src 'self'`; scripts `'self'` plus that nonce and `'strict-dynamic'`; styles `'self'` plus the nonce; `connect-src` this site and `ai-gateway.vercel.sh` over HTTPS and `wss`; `img-src 'self' data:`; no objects, no framing (`frame-ancestors 'none'`), forms only to this site. Development adds `unsafe-eval` and `unsafe-inline` for the dev server. The matcher skips `/api`, static assets and prefetch requests, so API responses carry the static headers but no CSP.

A nonce is different on every request, so **every page must be rendered per request**: nothing can be statically prerendered or cached. The root layout calls `connection()` to say so, and the signed-in pages already read cookies. This costs nothing here, since every page is per-user, but a new page must not opt into static rendering or it will ship without a nonce and its scripts will be blocked.

