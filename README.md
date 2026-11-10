# Care Navigation Voice Trainer

A proof of concept for one GP practice in Wales. A receptionist picks a scenario and has a spoken phone call with an AI playing a patient. Their job is to navigate the caller to the right service. When they hang up, they get the transcript and a scored debrief.

The brief is in [`docs/POC_BRIEF.md`](docs/POC_BRIEF.md). What has and has not been tested is in [`docs/spike-findings.md`](docs/spike-findings.md).

> **Not for wider use as it stands.** Access is a single shared code plus a typed name. That is not authentication: anyone with the code can type someone else's name and see their calls. Replace it with real sign-in before this goes beyond a handful of trusted users at one practice. The scenarios are also unapproved drafts (see below).

## How it works

1. The trainee enters the access code and their name, and picks a scenario.
2. The server creates a session and mints a short-lived, single-use token for the voice model. The AI Gateway key never reaches the browser.
3. The browser opens a WebSocket to the voice model through Vercel AI Gateway. Audio flows directly between the browser and the model and is never stored.
4. The caller speaks first. Both sides are transcribed as text while the call runs.
5. On hang-up the browser posts the transcript to the server, which saves it and asks a separate text model to score it against the scenario's answer key and the rubric.
6. The trainee sees the debrief.

The patient model and the debrief model are separate. The patient's prompt (`src/patient/`) never contains the answer key; the assessor (`src/debrief/`) never role-plays.

## Setup

Needs Node 22 or later, a [Neon](https://neon.tech) Postgres database and a Vercel AI Gateway API key.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | What it is |
|---|---|
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key. Server only. |
| `DATABASE_URL` | Neon connection string. |
| `ACCESS_CODE` | The shared code trainees type. Changing it signs everyone out. |
| `REALTIME_MODEL` | Voice model. Default `openai/gpt-realtime-2.1`. |
| `DEBRIEF_MODEL` | Text model that writes the debrief, as a gateway model id. Required. |
| `REALTIME_VOICE` | Optional. Voice name, default `alloy`. |
| `REALTIME_PROVIDER_OPTIONS` | Optional. JSON passed to the voice session as provider options. |

Then create the tables, load the scenarios and start:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000 in Chrome or Edge with a headset.

Checks: `npm test`, `npm run typecheck`, `npm run lint`.

## Deploying to Vercel

Import the repository, set the environment variables above, and deploy. The build command (`npm run build`) applies database migrations and re-loads the scenarios before building, so the database always matches the code.

## Adding or changing a scenario

Edit [`src/scenarios/seed.ts`](src/scenarios/seed.ts) only, then redeploy (or run `npm run db:seed`). No other code changes are needed.

| Field | Meaning |
|---|---|
| `id` | Permanent slug, lower case with hyphens. Do not change it once calls exist. |
| `title`, `difficulty` | Shown on the scenario list. Keep the title from giving the answer away. |
| `persona` | Invented name, age and a line of character. |
| `openingLine` | The caller's first words. |
| `presentingStory` | What the caller says unprompted. |
| `hiddenFacts` | Things the caller only says if asked. Each has the `fact` and `unlockedBy`, the kind of question that brings it out. |
| `emotionalState` | How the caller feels and how that changes with good or poor handling. |
| `correctOutcome`, `acceptableAlternatives` | The answer key. Seen only by the debrief model. |
| `redFlags` | Leave empty if there is none; the red flag rubric item is then "n/a". |
| `unsafeOutcomes` | What counts as unsafe. The first one is shown on the debrief's unsafe banner. |
| `clinicianApproved` | Leave `false` until a GP has checked the answer key against the practice's protocols. While false, the debrief shows a "draft scenario" notice. |
| `active` | `false` hides it from the list. |

Removing a scenario from the file hides it; past calls are kept.

**Never put real patient details in a scenario, and tell trainees not to use any on a call.**

## How the debrief is scored

Seven items, each 0 to 2 with a one-line reason: greeting and identification, information gathering, red flag recognition, correct destination, stayed in role, explanation, manner. The overall score is the percentage of available marks; red flag recognition is left out when the scenario has none.

Some rules are enforced in code after the model answers, whatever it says (`src/debrief/run.ts`):

- If the scenario has a red flag and it was not handled, the outcome is unsafe.
- An unsafe outcome is never a correct outcome.
- Any strength or improvement whose quote does not appear in the transcript is dropped.

A call under 20 seconds, or one where the trainee never spoke, is not assessed: it is recorded as a fail with a score of 0.

## Known limitations

- **No real authentication** (see the top of this page).
- **Scenarios are drafts.** All four have `clinicianApproved: false`. The answer keys are not clinical guidance.
- **The caller's prompt is readable in the browser.** A trainee who opens developer tools can see the hidden facts (not the answer key). Accepted for the PoC.
- **The debrief is an AI judgement** against the answer key. It can be wrong, and its quality depends on `DEBRIEF_MODEL`.
- **Experimental voice API.** AI Gateway realtime and the AI SDK realtime hook are experimental and can change in patch releases, so `ai`, `@ai-sdk/react` and `@ai-sdk/gateway` are pinned to exact versions. Re-test a call after any upgrade.
- **Practice network untested.** The voice connection is a WebSocket to `ai-gateway.vercel.sh`; a practice firewall may block it.
- **Unfinished calls.** If the browser is closed mid-call, the session stays "Not finished" with no transcript.
- English only. Chrome and Edge on desktop only. Transcripts only, no audio. No analytics or third-party scripts.
