# Care Navigation Call Practice: design

Status: in build (started 15 November 2026). This is the maintainers' reference for how the app is put together and why. The PoC brief it grew from is in `docs/archive/`.

## 1. What the product is

GP reception staff practise care-navigation phone calls against a simulated caller, then get a scored debrief. The PoC proved the call and the debrief. This version makes it something several practices can run properly:

- Real accounts instead of a shared code and a typed name.
- Practices as tenants. A practice's staff, calls, scores and scenarios are visible only inside that practice.
- Managers who invite staff and see how their team is doing.
- Scenarios each practice owns, edits and has a clinician approve against its own protocols.
- A platform admin who sets up practices.

Deliberately not in this version: Welsh language, billing, single sign-on, email sending, audio storage, assignments and deadlines. None of the design below blocks adding them.

## 2. People and what they can do

| Who | How they are represented | Can |
|---|---|---|
| Trainee | membership `role = 'trainee'` | take calls; see their own debriefs, history and progress |
| Manager | membership `role = 'manager'` | everything a trainee can; invite and manage staff; see every call, debrief and report in the practice; manage scenarios; change practice settings |
| Clinician approver | membership `can_approve_scenarios = true` (on a trainee or a manager) | view and edit scenarios including answer keys; approve them; take calls on draft scenarios |
| Platform admin | `users.is_platform_admin = true` | create and suspend practices; invite a practice's first manager; see usage per practice |

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

Platform admin does not imply any practice ability. An admin who needs to see inside a practice is given a membership like anyone else, so access to practice data is always explicit and visible in the team list.

## 3. Architecture rules

These are the rules that keep tenants apart and the code maintainable. Code review holds to them.

1. **One way in to the database.** Only data-access modules (`src/**/dal.ts`, `src/**/*-dal.ts`), `src/auth/*`, `src/db/*`, `src/audit/*` and tests may import `@/db/client`. Pages, server actions and route handlers call data-access functions. ESLint enforces this with `no-restricted-imports`.
2. **Every data-access function that touches practice data takes an `Actor`** and puts `actor.membership.practiceId` in the SQL `WHERE`. It never accepts a practice id from the request. Looking up another practice's row returns "not found", never "forbidden".
3. **Every server action and route handler starts by resolving the actor and checking an ability.** A check on the page does not protect the action behind it.
4. **No database transactions.** The driver is `drizzle-orm/neon-http`, which has none. Multi-step writes are ordered so that a failure part-way leaves nothing dangerous, and one-time things (invitation tokens) are claimed with a single `UPDATE ... WHERE used_at IS NULL ... RETURNING`.
5. **A call is judged against the scenario as it was when the call started.** `sessions.scenario_snapshot` holds it. Later edits to a scenario never change an old debrief.
6. **The caller model and the assessor model stay separate.** `src/patient/*` never sees the answer key; `src/debrief/*` never role-plays. Neither imports the other.
7. **No audio is stored. No analytics, third-party scripts or external assets.**
8. **Things that change who can see or do what are written to `audit_log`.**

Next.js 16 conventions that differ from older versions are summarised in `docs/engineering/next16-notes.md`. `AGENTS.md` requires reading the bundled docs before writing Next code.

## 4. Data model

SQL names are snake_case; Drizzle properties are camelCase. All ids are `uuid` with `defaultRandom()` unless stated. All timestamps are `timestamptz`.

### Accounts

**`users`**: `id`, `email` (unique; stored trimmed and lower-cased), `name`, `password_hash` (null until set), `is_platform_admin` (default false), `privacy_ack_at` (null until they accept the notice), `created_at`, `last_sign_in_at`, `disabled_at`.

**`auth_sessions`**: `id`, `token_hash` (unique; SHA-256 of the cookie token), `user_id` → users (cascade), `active_practice_id` → practices (set null), `created_at`, `expires_at`. Index on `user_id`.

**`auth_throttle`**: `key` (text, primary key, e.g. `email:a@b.c` or `ip:1.2.3.4`), `count`, `window_started_at`.

**`invitations`** (also used for password resets): `id`, `kind` (`'invite' | 'reset'`), `token_hash` (unique), `practice_id` → practices (null for a reset), `email`, `name`, `role` (null for a reset), `can_approve_scenarios`, `user_id` → users (the account a reset is for; null for an invite), `created_by` → users, `created_at`, `expires_at`, `used_at`, `revoked_at`.

### Practices

**`practices`**: `id`, `name`, `created_at`, `suspended_at`, `allow_draft_scenarios` (default false), `transcript_retention_days` (null means keep).

**`memberships`**: `id`, `practice_id` → practices, `user_id` → users, `role` (`'trainee' | 'manager'`), `can_approve_scenarios` (default false), `created_at`, `deactivated_at`. Unique `(practice_id, user_id)`.

### Scenarios

**`scenarios`** is the shared **library**: templates maintained in `src/scenarios/seed.ts` and synced on deploy. Text slug primary key, content columns, `active`. The old `clinician_approved` column is dropped; approval belongs to a practice.

**`practice_scenarios`** are what staff actually call. Each practice owns its copies and may write its own: `id`, `practice_id` → practices (not null), `library_scenario_id` → scenarios.id (text, null for a practice-written scenario), `revision` (int, starts at 1), the same content columns as the library (`title`, `difficulty`, `persona`, `voice`, `opening_line`, `presenting_story`, `hidden_facts`, `emotional_state`, `correct_outcome`, `acceptable_alternatives`, `red_flags`, `unsafe_outcomes`), `active`, `approved_revision`, `approved_by` → users, `approved_at`, `created_at`, `updated_at`, `updated_by` → users. Unique `(practice_id, library_scenario_id)`.

- A scenario is **approved** when `approved_revision = revision`.
- Any change to content adds one to `revision`, which makes it a draft again. Switching `active` does not.
- When a practice is created, every active library scenario is copied into it as a draft. A library scenario added later appears on the practice's scenario page as "available to add".
- Trainees see a scenario when it is active and either approved or the practice has `allow_draft_scenarios`. Managers and approvers always see active drafts so they can test them.

### Calls

**`sessions`** gains `practice_id` → practices, `user_id` → users, `practice_scenario_id` → practice_scenarios, and `scenario_snapshot` (jsonb: the scenario content plus `practiceScenarioId`, `libraryScenarioId`, `revision`, `approved`). `scenario_id` and `trainee_name` become nullable and are legacy: rows from the PoC have them and nothing else, belong to no practice, and are not shown anywhere. Indexes on `(practice_id, started_at)` and `(user_id, started_at)`.

**`transcript_turns`**: unchanged.

**`debriefs`**: gains `prompt_version` (text).

**`debrief_flags`**: `id`, `session_id` → sessions (cascade), `practice_id` → practices, `user_id` → users, `reason`, `created_at`, `resolved_at`, `resolved_by` → users.

**`audit_log`**: `id`, `at` (default now), `actor_user_id`, `practice_id`, `action` (e.g. `member.invited`, `scenario.approved`), `target_type`, `target_id` (text), `detail` (jsonb). Index on `(practice_id, at)`.

## 5. Sign-in

Built in-house, small and fully tested, because the alternatives did not fit (no email sending, invitations for people with no account yet, no transactions). `src/auth/` holds all of it.

- **Passwords:** scrypt from `node:crypto` (N=16384, r=8, p=1, 64-byte key, 16-byte random salt), stored as `scrypt$N$r$p$salt$hash` so parameters can change later. Compared with `timingSafeEqual`. 12 to 128 characters; must not contain the user's email name or be on a short built-in list of obvious passwords.
- **Sessions:** a 32-byte random token in an `httpOnly`, `sameSite=lax`, `secure` cookie (named `__Host-cn_session` in production, `cn_session` in development). Only its SHA-256 is stored. A session lasts 12 hours from sign-in and is not extended, because reception desktops are shared. A new token is issued on every sign-in. Changing or resetting a password deletes the user's other sessions.
- **Who is asking:** `getActor()` (returns `Actor | null`) and `requireActor()` (redirects to `/sign-in`) in `src/auth/current.ts`, wrapped in React `cache()`. They load the session, the user and the active membership in one query and treat a disabled user, a deactivated membership or a suspended practice as not signed in to that practice.
- **Throttling:** failed sign-ins are counted in `auth_throttle` per email (8 in 15 minutes) and per IP (30 in 15 minutes). Over the limit, sign-in is refused for the rest of the window, with the same message as a wrong password.
- **No user enumeration:** one message for unknown email, wrong password, disabled account. An unknown email still costs one scrypt.
- **Cross-site requests:** server actions are origin-checked by Next. The two JSON route handlers check that `Origin` matches the request host.
- **First run:** `/setup` works only while `users` is empty and requires the `SETUP_CODE` env value. It creates the platform admin, the first practice, and that person's manager membership.
- **Invitations:** a manager fills in name, email, role and whether the person can approve scenarios. The app shows a link, `/invite/<token>`, once. The manager passes it on however they like. It lasts 7 days. The invitee sets a password and accepts the privacy notice. If the email already has an account, the membership is added straight away and no link is needed.
- **Forgotten passwords:** a manager creates a reset link (24 hours) for a member of their practice. To stop this being a way into other practices or the platform, a manager may only do this for someone who is not a platform admin and has no active membership anywhere else; otherwise a platform admin does it. A locked-out platform admin uses `npm run admin:reset-link -- <email>` with database access.

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
| `/reports`, `/reports/export` | manager | practice dashboard; CSV download |
| `/scenarios`, `/scenarios/new`, `/scenarios/[id]` | manager or approver | list with approval state; write; edit, test, approve; add from library |
| `/settings` | manager | practice name, draft scenarios on or off, transcript retention |
| `/admin`, `/admin/practices/[id]` | platform admin | practices, usage, suspend, invite a manager |

The interface is plain and large, for reception desktops with a headset: British English, short sentences, WCAG 2.2 AA, no external assets. Shared components live in `src/ui/`.

## 7. Limits

- A call is hung up automatically at 10 minutes, with a warning at 9 (`MAX_CALL_SECONDS`).
- A user can start 25 calls a day (`DAILY_CALL_LIMIT`).
- A call under 20 seconds, or where the trainee never spoke, is a fail with a score of 0.

## 8. Code layout

```
src/db/          schema, client (the Db type and getDb), migrate, library seed
src/auth/        passwords, tokens, sessions, throttle, current actor, invitations
src/policy/      Actor type, can()
src/practices/   practices, memberships, team, settings
src/scenarios/   scenario types, library, practice scenarios, approval
src/sessions/    starting, ending, reading calls
src/patient/     caller prompt and voice session config
src/call/        browser call hook, transcript assembly
src/debrief/     rubric, assessor prompt, run, rules
src/reports/     dashboard queries, CSV
src/admin/       platform admin queries
src/audit/       audit log writer
src/ui/          shared components and app shell
src/app/         routes
```

Tests sit beside the code as `*.test.ts`. Pure logic has unit tests. Data-access modules have integration tests that run the real migrations against an in-process Postgres (PGlite), so tenancy rules are tested for real with no network. Voice and debrief quality are checked by opt-in scripts that need a gateway key.

## 9. Environments

- `main` is production. Work happens on branches and reaches production by pull request.
- Production uses the Neon default branch. Preview deployments and local development use the Neon `preview` branch. The build runs migrations and the library sync against whichever database its environment points at.

Environment variables: `AI_GATEWAY_API_KEY`, `DATABASE_URL`, `SETUP_CODE`, `REALTIME_MODEL`, `DEBRIEF_MODEL`, and optionally `REALTIME_TURN_DETECTION`, `REALTIME_PROVIDER_OPTIONS`, `MAX_CALL_SECONDS`, `DAILY_CALL_LIMIT`. `ACCESS_CODE` is retired.
