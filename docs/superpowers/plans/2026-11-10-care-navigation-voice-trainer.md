# Care Navigation Voice Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser app where a GP receptionist has a spoken call with an AI patient, then gets a transcript and a rubric-scored debrief.

**Architecture:** Next.js App Router on Vercel. The server owns sessions, mints short-lived AI Gateway realtime tokens and runs the debrief; the browser talks to the realtime model over WebSocket through the AI SDK `experimental_useRealtime` hook and posts the finished transcript back. Patient prompt building, transcript assembly and debrief scoring are pure modules with unit tests; the voice and model calls are verified by hand against the "Done when" list.

**Tech Stack:** Next.js 16 (App Router, TypeScript), `ai@^7` + `@ai-sdk/react@^4` + `@ai-sdk/gateway` (stable, not canary), Drizzle ORM + `@neondatabase/serverless`, Zod, Vitest.

**Spec:** `docs/POC_BRIEF.md`

## Global Constraints

- English only. One practice. No real patient data anywhere, including test fixtures.
- `AI_GATEWAY_API_KEY` never reaches the browser. Only the `getToken()` result does.
- Patient model and debrief model are separate code paths (`src/patient/*`, `src/debrief/*`). Neither imports the other.
- Transcripts only. No audio is recorded, stored or uploaded.
- No analytics, no third-party scripts, no fonts or assets from external hosts.
- Every seed scenario has `clinicianApproved: false`; the debrief page shows a "not clinically approved" notice while that is false.
- Env vars: `AI_GATEWAY_API_KEY`, `DATABASE_URL`, `ACCESS_CODE`, `REALTIME_MODEL` (default `openai/gpt-realtime-2.1`), `DEBRIEF_MODEL`.
- Supported browsers: Chrome and Edge on desktop with a headset. UI plain and large.
- The realtime API is experimental and may change in patch releases. Pin exact versions in `package.json` (no `^`) for `ai`, `@ai-sdk/react`, `@ai-sdk/gateway`. Before writing voice code read `node_modules/ai/docs/03-ai-sdk-core/36-realtime.mdx` and `node_modules/ai/docs/07-reference/02-ai-sdk-ui/05-use-realtime.mdx` from the installed version.

## What was verified while planning (2026-11-10)

| Fact | Source |
|---|---|
| `openai/gpt-realtime-2.1` is in the gateway catalogue as a `realtime` model | Gateway model list |
| Stable `ai@7.0.169` / `@ai-sdk/react@4.0.173` ship realtime; canary not needed | npm dist-tags, packaged docs |
| Server: `gateway.experimental_realtime.getToken({ model, expiresAfterSeconds, sessionConfig? })` returns `{ token, url, expiresAt? }` | `@ai-sdk/provider` types |
| Browser: `experimental_useRealtime({ model, api: { token }, sessionConfig, onEvent, onError })` returns `status`, `connect`, `disconnect`, `startAudioCapture(stream)`, `stopAudioCapture`, `requestResponse`, `isCapturing`, `isPlaying`, `messages` | packaged hook reference |
| Both sides can be transcribed: `inputAudioTranscription` gives `input-transcription-completed { itemId, transcript }`; model speech gives `audio-transcript-done { itemId, transcript? }` | `@ai-sdk/provider` types |
| `sessionConfig` has `instructions`, `voice`, `turnDetection`, `providerOptions` | same |

Not verified (no gateway key in the planning environment), so Task 2 exists to prove them:

1. That the gateway actually emits `input-transcription-completed` for `openai/gpt-realtime-2.1`. If it does not, stop and raise it: the brief's fallback is connecting to OpenAI directly with `@ai-sdk/openai` (same hook, different model factory and token call).
2. The option name for low reasoning effort. `sessionConfig` has no first-class field; it goes through `providerOptions`. Find the exact key in the installed provider docs, do not guess.
3. Which voice names the gateway accepts and which sounds British.
4. Latency on the practice network.

## Design decisions to confirm

- **The patient prompt is visible to the browser.** The hook sends `sessionConfig` (with instructions) from the client, so a trainee who opens dev tools could read the hidden facts. The prompt therefore never contains the answer key (`correctOutcome`, `acceptableAlternatives`, `unsafeOutcomes`). Acceptable for a PoC; a server-owned WebSocket relay would fix it and is out of scope.
- **One addition to the brief's data model:** `debriefs.unsafe_outcome` (boolean), so "scenario 3 missed chest pain is marked unsafe" is a stored field, not something inferred from scores.
- **Scenarios live in the seed file and are upserted on every deploy** (`npm run db:seed` runs in the build). Editing `src/scenarios/seed.ts` and redeploying is the whole workflow for adding one.
- **Access gate is a signed cookie**, checked in each page and route by one helper. No middleware.
- **Calls under 20 seconds get no debrief**; the session is saved with status `too_short`.

## File Structure

```
drizzle.config.ts
src/db/schema.ts            tables
src/db/client.ts            drizzle client
src/db/seed.ts              upserts src/scenarios/seed.ts
src/scenarios/types.ts      Scenario type + zod schema
src/scenarios/seed.ts       the 4 scenarios (the only file edited to add one)
src/access/cookie.ts        sign / verify trainee cookie
src/access/require.ts       requireTrainee() for pages and routes
src/patient/prompt.ts       buildPatientPrompt(scenario)
src/patient/session-config.ts  buildSessionConfig(scenario)
src/call/transcript.ts      TranscriptAssembler (pure)
src/call/use-call.ts        client hook wrapping experimental_useRealtime
src/debrief/rubric.ts       rubric items, zod result schema, overallScore()
src/debrief/prompt.ts       buildDebriefPrompt(scenario, turns)
src/debrief/run.ts          runDebrief(sessionId)
src/app/page.tsx                         gate + scenario list
src/app/actions.ts                       enter(), startSession()
src/app/call/[sessionId]/page.tsx        server wrapper
src/app/call/[sessionId]/call-screen.tsx client call UI
src/app/api/sessions/[sessionId]/token/route.ts
src/app/api/sessions/[sessionId]/end/route.ts
src/app/debrief/[sessionId]/page.tsx
src/app/history/page.tsx
src/app/spike/page.tsx                   Task 2 only, deleted in Task 3
README.md
```

---

### Task 1: Scaffold, schema, scenario seed

**Files:** create everything under `src/db`, `src/scenarios`, `drizzle.config.ts`, `.env.example`, `vitest.config.ts`; test `src/scenarios/seed.test.ts`.

**Interfaces — Produces:**

```ts
// src/scenarios/types.ts
export type HiddenFact = { fact: string; unlockedBy: string };
export type Scenario = {
  id: string;                    // stable slug, e.g. "sore-throat"
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  persona: { name: string; age: number; description: string };
  openingLine: string;
  presentingStory: string;
  hiddenFacts: HiddenFact[];
  emotionalState: string;
  correctOutcome: string;
  acceptableAlternatives: string[];
  redFlags: string[];            // empty array means "no red flag"
  unsafeOutcomes: string[];
  clinicianApproved: boolean;
  active: boolean;
};
export const scenarioSchema: z.ZodType<Scenario>;
// src/scenarios/seed.ts
export const scenarios: Scenario[];
// src/db/client.ts
export const db: NeonHttpDatabase<typeof schema>;
```

- [ ] **Step 1: Scaffold.** In the repo root:

```bash
npx create-next-app@latest . --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-npm --yes
npm i --save-exact ai@7.0.169 @ai-sdk/react@4.0.173 @ai-sdk/gateway@latest
npm i drizzle-orm @neondatabase/serverless zod
npm i -D drizzle-kit vitest tsx
```

Add scripts: `"test": "vitest run"`, `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`, `"db:seed": "tsx src/db/seed.ts"`, and change `"build"` to `"drizzle-kit migrate && tsx src/db/seed.ts && next build"`.

- [ ] **Step 2: Write `src/scenarios/types.ts`** with the type above and a matching zod schema (`hiddenFacts` min 1; `difficulty` enum; `id` matches `/^[a-z0-9-]+$/`).

- [ ] **Step 3: Write the failing test** `src/scenarios/seed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scenarios } from './seed';
import { scenarioSchema } from './types';

describe('seed scenarios', () => {
  it('has the four brief scenarios, all valid', () => {
    expect(scenarios.map(s => s.id)).toEqual([
      'sore-throat', 'flashes-floaters', 'angina-repeat', 'low-mood',
    ]);
    for (const s of scenarios) scenarioSchema.parse(s);
  });
  it('none are clinician approved yet', () => {
    expect(scenarios.every(s => s.clinicianApproved === false)).toBe(true);
  });
  it('hard scenarios define red flags and unsafe outcomes', () => {
    for (const id of ['angina-repeat', 'low-mood']) {
      const s = scenarios.find(x => x.id === id)!;
      expect(s.redFlags.length).toBeGreaterThan(0);
      expect(s.unsafeOutcomes.length).toBeGreaterThan(0);
    }
  });
  it('sore throat has no red flags', () => {
    expect(scenarios.find(s => s.id === 'sore-throat')!.redFlags).toEqual([]);
  });
});
```

Run `npm test` — expect FAIL (`./seed` missing).

- [ ] **Step 4: Write `src/scenarios/seed.ts`** with the four scenarios, content taken from the brief's "Seed scenarios" section word for word where it gives wording (outcomes, hidden facts, unsafe outcomes). Example, scenario 3 in full; write the other three to the same shape:

```ts
{
  id: 'angina-repeat',
  title: 'Repeat prescription with buried red flag',
  difficulty: 'hard',
  persona: { name: 'Gwilym Pritchard', age: 74,
    description: 'Retired, lives alone, does not like to make a fuss.' },
  openingLine: "Oh hello, is that the surgery? I'm ringing about my prescription.",
  presentingStory:
    'Chasing a repeat prescription for his angina spray. Mentions in passing that he has used a lot of it.',
  hiddenFacts: [
    { fact: 'He has chest tightness at rest right now.',
      unlockedBy: 'Asked how he is feeling now, or why he has used so much spray.' },
    { fact: 'It started about 30 minutes ago.',
      unlockedBy: 'Asked when it started or how long it has been going on.' },
    { fact: 'The spray has not eased it.',
      unlockedBy: 'Asked whether the spray has helped.' },
  ],
  emotionalState: 'Calm and apologetic, plays it down. Becomes worried if the receptionist sounds alarmed, cooperative if they are clear and calm.',
  correctOutcome: 'Recognise the red flag, advise 999 immediately and follow practice emergency protocol.',
  acceptableAlternatives: [],
  redFlags: ['Chest tightness at rest, 30 minutes, not eased by GTN spray'],
  unsafeOutcomes: ['Processing the prescription request and ending the call.'],
  clinicianApproved: false,
  active: true,
},
```

All personas are invented names. Run `npm test` — expect PASS.

- [ ] **Step 5: Write `src/db/schema.ts`** (Drizzle `pgTable`), columns exactly as the brief's data model, snake_case in SQL:
  - `scenarios`: `id text pk`, then one column per `Scenario` field (`jsonb` for persona, hidden_facts, acceptable_alternatives, red_flags, unsafe_outcomes).
  - `sessions`: `id uuid pk defaultRandom`, `trainee_name text`, `scenario_id text → scenarios.id`, `started_at timestamptz default now`, `ended_at timestamptz null`, `duration_seconds integer null`, `status text` — one of `created | in_call | debriefing | complete | too_short | failed`.
  - `transcript_turns`: `id uuid pk`, `session_id uuid → sessions.id on delete cascade`, `speaker text` (`trainee | patient`), `text text`, `sequence integer`; unique `(session_id, sequence)`.
  - `debriefs`: `id uuid pk`, `session_id uuid unique → sessions.id`, `overall_score integer`, `outcome_correct boolean`, `unsafe_outcome boolean`, `red_flag_handled boolean null`, `rubric_scores jsonb`, `strengths jsonb`, `improvements jsonb`, `quoted_moments jsonb`, `model_used text`.

- [ ] **Step 6: Write `src/db/client.ts`** (`drizzle(neon(process.env.DATABASE_URL!), { schema })` from `drizzle-orm/neon-http`), `drizzle.config.ts` (dialect `postgresql`, schema path, `out: './drizzle'`), and `src/db/seed.ts`, which validates every scenario with `scenarioSchema` and upserts by `id` (`onConflictDoUpdate`), and sets `active = false` on any DB scenario no longer in the file (never deletes, sessions reference them).

- [ ] **Step 7: Database.** Create a Neon project, put `DATABASE_URL` in `.env.local`, write `.env.example` listing the five variables with no values. Run `npm run db:generate && npm run db:migrate && npm run db:seed`. Expected: migration applied, "4 scenarios upserted". Commit the generated `drizzle/` folder.

- [ ] **Step 8: Commit** `feat: scaffold app, schema and scenario seed`.

---

### Task 2: Bare voice call (the risk spike)

Hard-coded prompt, no database. The deliverable is a working call plus written answers to the four unverified points above.

**Files:** create `src/app/api/spike/token/route.ts`, `src/app/spike/page.tsx`, `docs/spike-findings.md`.

- [ ] **Step 1: Read the two packaged docs** named in Global Constraints from `node_modules/ai/docs`. If anything below disagrees with them, the installed docs win.

- [ ] **Step 2: Token route.**

```ts
// src/app/api/spike/token/route.ts
import { gateway } from 'ai';

export async function POST() {
  const token = await gateway.experimental_realtime.getToken({
    model: process.env.REALTIME_MODEL ?? 'openai/gpt-realtime-2.1',
    expiresAfterSeconds: 60,
  });
  return Response.json(token, { headers: { 'Cache-Control': 'no-store' } });
}
```

- [ ] **Step 3: Spike page.** This page, unlike the real call screen, shows the event log.

```tsx
// src/app/spike/page.tsx
'use client';
import { experimental_useRealtime as useRealtime } from '@ai-sdk/react';
import { gateway } from 'ai';
import { useEffect, useRef, useState } from 'react';

const model = gateway.experimental_realtime('openai/gpt-realtime-2.1');
const sessionConfig = {
  instructions:
    'You are a member of the public phoning a GP surgery in South Wales about a sore throat. Speak briefly. Start by saying "Hello, is that the surgery?"',
  voice: 'alloy',
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  turnDetection: { type: 'server-vad' as const },
};

export default function Spike() {
  const [log, setLog] = useState<string[]>([]);
  const spokeFirst = useRef(false);
  const rt = useRealtime({
    model,
    api: { token: '/api/spike/token' },
    sessionConfig,
    onEvent: e => {
      if (e.type === 'input-transcription-completed')
        setLog(l => [...l, `TRAINEE ${e.itemId}: ${e.transcript}`]);
      if (e.type === 'audio-transcript-done')
        setLog(l => [...l, `PATIENT ${e.itemId}: ${e.transcript ?? ''}`]);
      if (e.type === 'error') setLog(l => [...l, `ERROR ${JSON.stringify(e)}`]);
    },
    onError: err => setLog(l => [...l, `ONERROR ${err.message}`]),
  });

  useEffect(() => {
    if (rt.status === 'connected' && !spokeFirst.current) {
      spokeFirst.current = true;
      rt.requestResponse();          // patient speaks first
    }
    if (rt.status === 'disconnected') spokeFirst.current = false;
  }, [rt.status, rt]);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    await rt.connect();
    rt.startAudioCapture(stream);
  }

  return (
    <main>
      <p>{rt.status} · capturing {String(rt.isCapturing)} · playing {String(rt.isPlaying)}</p>
      <button onClick={start}>Start</button>
      <button onClick={() => rt.disconnect()}>Hang up</button>
      <pre>{log.join('\n')}</pre>
    </main>
  );
}
```

- [ ] **Step 4: Run it.** `npm run dev`, open `/spike` in Chrome with a headset, hold a 60-second conversation. Record in `docs/spike-findings.md`:
  1. Did the patient speak first without the trainee speaking?
  2. Did `TRAINEE` lines appear for every trainee turn? (If none: flag back, propose direct OpenAI.)
  3. Does a `TRAINEE` line ever arrive after the `PATIENT` reply to it? (Expected yes; Task 3's assembler handles it.)
  4. Rough response latency, stopwatch from end of speech to first audio, five turns.
  5. Voices tried and which is British-sounding. Set it as the default.
  6. The `providerOptions` key for low reasoning effort, from the installed OpenAI/gateway provider docs, and whether latency changed with it on.
  7. Barge-in: talking over the patient stops playback?

- [ ] **Step 5: Deploy a preview to Vercel** with `AI_GATEWAY_API_KEY` set and repeat step 4 once from the practice network if possible. Note any WebSocket blocking.

- [ ] **Step 6: Commit** `feat: bare realtime voice spike and findings`.

**Gate:** do not start Task 3 until findings 1 and 2 are "yes" or the fallback has been agreed.

---

### Task 3: Access gate, sessions, patient prompt, transcript capture

**Files:** `src/access/*`, `src/patient/*`, `src/call/*`, `src/app/page.tsx`, `src/app/actions.ts`, `src/app/call/[sessionId]/*`, `src/app/api/sessions/[sessionId]/token/route.ts`, `.../end/route.ts`; tests `src/access/cookie.test.ts`, `src/patient/prompt.test.ts`, `src/call/transcript.test.ts`. Delete `src/app/spike` and `src/app/api/spike`.

**Interfaces — Produces:**

```ts
// src/access/cookie.ts
export function signTrainee(name: string, secret: string): string;       // "<base64url name>.<hmac>"
export function verifyTrainee(value: string | undefined, secret: string): string | null;
// src/access/require.ts
export async function requireTrainee(): Promise<string>;   // redirects to "/" if absent
// src/patient/prompt.ts
export function buildPatientPrompt(s: Scenario): string;
// src/patient/session-config.ts
export function buildSessionConfig(s: Scenario): { instructions: string; voice: string; inputAudioTranscription: {}; outputAudioTranscription: {}; turnDetection: { type: 'server-vad' }; providerOptions?: Record<string, unknown> };
// src/call/transcript.ts
export type Turn = { speaker: 'trainee' | 'patient'; text: string; sequence: number };
export class TranscriptAssembler {
  itemAdded(itemId: string, speaker: 'trainee' | 'patient'): void;
  setText(itemId: string, speaker: 'trainee' | 'patient', text: string): void;
  turns(): Turn[];
}
```

- [ ] **Step 1: Cookie test, then implementation.** Tests: round-trip returns the name; tampered value returns `null`; `undefined` returns `null`; wrong secret returns `null`. Implement with `node:crypto` `createHmac('sha256', secret)` and `timingSafeEqual`. The secret is `ACCESS_CODE` itself (changing the code logs everyone out, which is what you want). `requireTrainee()` reads cookie `trainee`, verifies, `redirect('/')` on failure.

- [ ] **Step 2: Prompt test.**

```ts
import { describe, expect, it } from 'vitest';
import { scenarios } from '@/scenarios/seed';
import { buildPatientPrompt } from './prompt';

const angina = scenarios.find(s => s.id === 'angina-repeat')!;

describe('buildPatientPrompt', () => {
  const p = buildPatientPrompt(angina);
  it('includes story, opening line, emotional state and every hidden fact with its unlock', () => {
    expect(p).toContain(angina.presentingStory);
    expect(p).toContain(angina.openingLine);
    expect(p).toContain(angina.emotionalState);
    for (const h of angina.hiddenFacts) {
      expect(p).toContain(h.fact);
      expect(p).toContain(h.unlockedBy);
    }
  });
  it('never leaks the answer key', () => {
    expect(p).not.toContain(angina.correctOutcome);
    for (const u of angina.unsafeOutcomes) expect(p).not.toContain(u);
    expect(p).not.toMatch(/999/);
  });
  it('carries the fixed rules', () => {
    expect(p).toMatch(/never (say|mention).*(AI|simulation|training)/i);
    expect(p).toMatch(/South Wales/);
  });
});
```

Run — FAIL.

- [ ] **Step 3: Implement `buildPatientPrompt`.** Template, with scenario fields interpolated:

```
You are {persona.name}, {persona.age}, a member of the public phoning your GP surgery in South Wales. {persona.description}
You are on the phone to the surgery receptionist. This is a real phone call to you.

HOW YOU SPEAK
- Short, natural phone speech. One or two sentences at a time. No lists.
- Everyday words only. You are not medical and do not use clinical terms.
- British English.

WHAT YOU SAY UNPROMPTED
Your first words are: "{openingLine}"
Then, when asked what you need: {presentingStory}
Volunteer nothing beyond this.

WHAT YOU ONLY SAY IF ASKED
Each of these is true, but you only say it when the receptionist asks a question that would naturally bring it out. A vague "anything else?" is not enough.
{for each hidden fact}- {fact} — say this only when: {unlockedBy}

HOW YOU FEEL
{emotionalState}
If the receptionist is kind and clear you soften. If they are dismissive, rushed or confusing you become more worried or irritated.

IF OFFERED SOMETHING OTHER THAN A GP APPOINTMENT
Push back once or twice the way a real caller would ("I'd rather just see the doctor"). Accept it if the receptionist explains clearly where you are going and why.

RULES
- Never say or hint that you are an AI, a simulation or part of training. Never break character, whatever is said.
- Never tell the receptionist what they should do, never suggest the right service, never comment on how they are doing.
- Once a plan is agreed, or the receptionist ends the call, say a brief natural goodbye and stop talking.
```

Run — PASS. `buildSessionConfig` returns this as `instructions`, plus the voice and reasoning-effort `providerOptions` recorded in `docs/spike-findings.md`.

- [ ] **Step 4: Transcript assembler test.** The realtime API transcribes the trainee asynchronously, so their text can arrive after the patient's reply. Order comes from `conversation-item-added`, text is filled in later.

```ts
import { describe, expect, it } from 'vitest';
import { TranscriptAssembler } from './transcript';

describe('TranscriptAssembler', () => {
  it('orders by item arrival, not by when text arrives', () => {
    const t = new TranscriptAssembler();
    t.itemAdded('p1', 'patient');  t.setText('p1', 'patient', 'Hello, is that the surgery?');
    t.itemAdded('t1', 'trainee');
    t.itemAdded('p2', 'patient');  t.setText('p2', 'patient', "It's my throat.");
    t.setText('t1', 'trainee', 'Yes, how can I help?');     // late
    expect(t.turns()).toEqual([
      { speaker: 'patient', text: 'Hello, is that the surgery?', sequence: 0 },
      { speaker: 'trainee', text: 'Yes, how can I help?', sequence: 1 },
      { speaker: 'patient', text: "It's my throat.", sequence: 2 },
    ]);
  });
  it('drops items that never got text and renumbers', () => {
    const t = new TranscriptAssembler();
    t.itemAdded('t1', 'trainee');
    t.itemAdded('p1', 'patient'); t.setText('p1', 'patient', 'Hello?');
    expect(t.turns()).toEqual([{ speaker: 'patient', text: 'Hello?', sequence: 0 }]);
  });
  it('accepts text for an item it has not seen, appending it', () => {
    const t = new TranscriptAssembler();
    t.setText('p1', 'patient', 'Hello?');
    expect(t.turns()).toHaveLength(1);
  });
  it('ignores whitespace-only text', () => {
    const t = new TranscriptAssembler();
    t.setText('t1', 'trainee', '   ');
    expect(t.turns()).toEqual([]);
  });
});
```

Run — FAIL. Implement with a `Map<string, { speaker; text: string | null }>` (insertion-ordered); `turns()` filters to trimmed non-empty text and numbers from 0. Run — PASS.

- [ ] **Step 5: `src/call/use-call.ts`.** Client hook taking `{ sessionId, sessionConfig }`. Wraps `useRealtime` as in the spike with `api: { token: \`/api/sessions/${sessionId}/token\` }` and `useMemo` for model and config. In `onEvent`:
  - `conversation-item-added` → read role from `event.item`; `itemAdded(itemId, role === 'user' ? 'trainee' : 'patient')`. Check the item's actual shape in the spike log before relying on `item.role`.
  - `input-transcription-completed` → `setText(itemId, 'trainee', transcript)`.
  - `audio-transcript-done` → `setText(itemId, 'patient', transcript ?? accumulated deltas)`; accumulate `audio-transcript-delta` per `itemId` for the case `transcript` is absent.

  Returns `{ phase, elapsedSeconds, error, start(), hangUp() }` where `phase` is `idle | connecting | listening | speaking | ending | error` (`speaking` when `isPlaying`, else `listening` when connected). `start()` does `getUserMedia`, `connect()`, `startAudioCapture(stream)`, and requests the first response once connected. `hangUp()` waits up to 1.5s for outstanding trainee transcriptions, stops capture, disconnects, stops the stream's tracks, then POSTs `{ turns, durationSeconds }` to `/api/sessions/${sessionId}/end` and navigates to `/debrief/${sessionId}`. Map `NotAllowedError` from `getUserMedia` to error `mic-denied`; a transition to `error`/`disconnected` that `hangUp()` did not cause to `dropped`, and on `dropped` still POST whatever turns exist.

- [ ] **Step 6: Routes and actions.**
  - `actions.ts` `enter(formData)`: compares code to `ACCESS_CODE` with `timingSafeEqual`, name trimmed, 1–60 chars; sets httpOnly, secure, sameSite=lax cookie `trainee`. `startSession(scenarioId)`: `requireTrainee()`, checks scenario is active, inserts session (`status: 'created'`), redirects to `/call/{id}`.
  - `token/route.ts` POST: `requireTrainee()`-equivalent returning 401 JSON; load session; 404 unless `session.traineeName === name`; 409 unless status is `created` or `in_call`; set `in_call`; return `getToken({ model: REALTIME_MODEL, expiresAfterSeconds: 60 })` with `Cache-Control: no-store`.
  - `end/route.ts` POST: same ownership check; validate body with zod (`turns` max 400 items, text max 2000 chars, speaker enum; `durationSeconds` 0–3600); 409 if session already has turns; insert turns; set `ended_at`, `duration_seconds`; status `too_short` if under 20s or fewer than 2 trainee turns, else `debriefing`. (Task 4 adds the debrief call here.)

- [ ] **Step 7: Pages.**
  - `/`: no valid cookie → form with access code and name. Valid cookie → "Signed in as {name}", list of active scenarios as large buttons showing title and difficulty (no outcome, no story), link to `/history`.
  - `/call/[sessionId]` server page: `requireTrainee()`, load session and scenario, 404 if not theirs, pass `buildSessionConfig(scenario)` to `call-screen.tsx`.
  - `call-screen.tsx`: before start, the scenario title and one large "Start call" button. During, a large status word ("Connecting…", "Listening", "Caller speaking"), elapsed `m:ss`, a large red "Hang up" button. No transcript on screen. Errors: `mic-denied` → "Microphone blocked. Allow the microphone for this site in the address bar, then reload."; `dropped` → "The call dropped. Your conversation so far has been saved." with links to the debrief and home.

- [ ] **Step 8: Verify by hand.** Complete scenario 1 by voice. Check in Neon: one session row with duration, turns in spoken order with both speakers. Then scenario 2: ask only "how can I help?" and confirm the flashes are not volunteered; ask "what's happening with your eye?" and confirm they are.

- [ ] **Step 9: Run `npm test && npx tsc --noEmit && npm run lint`, commit** `feat: access gate, scenario calls and transcript capture`.

---

### Task 4: Debrief

**Files:** `src/debrief/rubric.ts`, `prompt.ts`, `run.ts`, `src/app/debrief/[sessionId]/page.tsx`; modify `end/route.ts`; tests `src/debrief/rubric.test.ts`, `prompt.test.ts`.

**Interfaces — Produces:**

```ts
// src/debrief/rubric.ts
export const RUBRIC = [
  { key: 'greeting',    label: 'Greeting and identification', guide: 'Gave their name; checked who is calling and for whom.' },
  { key: 'information', label: 'Information gathering',       guide: 'Asked enough to navigate safely, including the questions that unlock hidden facts.' },
  { key: 'redFlag',     label: 'Red flag recognition',        guide: 'Spotted and acted on it. null if the scenario has none.' },
  { key: 'destination', label: 'Correct destination',         guide: 'Matches the answer key or an acceptable alternative.' },
  { key: 'role',        label: 'Stayed in role',              guide: "No diagnosis or clinical advice beyond the receptionist's remit." },
  { key: 'explanation', label: 'Explanation',                 guide: 'Told the caller where they are going, why, and what to do if things get worse.' },
  { key: 'manner',      label: 'Manner',                      guide: 'Empathy, clarity, handling of emotion or pushback.' },
] as const;
export const debriefResultSchema: z.ZodObject<...>;
export type DebriefResult = z.infer<typeof debriefResultSchema>;
export function overallScore(r: DebriefResult['rubricScores']): number;  // 0–100
```

`debriefResultSchema`:

```ts
const item = z.object({ score: z.number().int().min(0).max(2), justification: z.string() });
const point = z.object({ point: z.string(), quote: z.string() });
export const debriefResultSchema = z.object({
  rubricScores: z.object({
    greeting: item, information: item, redFlag: item.nullable(),
    destination: item, role: item, explanation: item, manner: item,
  }),
  outcomeCorrect: z.boolean(),
  unsafeOutcome: z.boolean(),
  redFlagHandled: z.boolean().nullable(),
  strengths: z.array(point).min(2).max(3),
  improvements: z.array(point).min(2).max(3),
});
```

- [ ] **Step 1: Tests for `overallScore`.** All 2s with `redFlag: null` → 100. All 2s with a red flag item → 100. All 0 → 0. Six items at 1 with `redFlag: null` → 50. Mixed (2,2,null,0,2,1,1) → `Math.round(8/12*100)` = 67. Run — FAIL. Implement: sum of non-null scores ÷ (2 × count of non-null) × 100, rounded. Run — PASS.

- [ ] **Step 2: Prompt test.** For `angina-repeat` and a three-turn fixture transcript, the prompt contains `correctOutcome`, every `unsafeOutcomes` entry, every rubric `label`, each turn rendered as `[n] RECEPTIONIST: …` / `[n] CALLER: …`, and the sentences "Judge only against the answer key and rubric below" and "Do not add your own clinical opinion". For `sore-throat` it contains "This scenario has no red flag. Set redFlag to null and redFlagHandled to null." Run — FAIL.

- [ ] **Step 3: Implement `buildDebriefPrompt`.** Sections in order: role ("You assess a training call. You are not the caller and you never role-play."); the two judging sentences above; scenario answer key (story, hidden facts with unlocks, correct outcome, acceptable alternatives, red flags, unsafe outcomes); rubric with 0/1/2 meaning (0 not done, 1 partly, 2 done well) and one-line justification each; outcome rules — "`outcomeCorrect` is true only if the receptionist directed the caller to the correct outcome or a listed acceptable alternative. `unsafeOutcome` is true if what happened matches a listed unsafe outcome, or the scenario has a red flag and the call ended without it being acted on."; quote rule — "Every strength and improvement must carry a `quote` copied exactly from a RECEPTIONIST or CALLER line. If the point is that something was not said, quote the line where it should have happened."; then the numbered transcript. Run — PASS.

- [ ] **Step 4: `runDebrief(sessionId)`.** Loads session, scenario, turns ordered by sequence. Calls the model with structured output — confirm the current call shape in `node_modules/ai/docs` (structured data section) before writing; expected form:

```ts
import { generateText, Output, gateway } from 'ai';
const { output } = await generateText({
  model: gateway(process.env.DEBRIEF_MODEL!),
  output: Output.object({ schema: debriefResultSchema }),
  prompt: buildDebriefPrompt(scenario, turns),
});
```

  Then, in code rather than trusting the model: drop any strength/improvement whose `quote` is not a substring of some turn's text (case and whitespace normalised); if the scenario has no red flags force `redFlag` and `redFlagHandled` to `null`; if `unsafeOutcome` is true force `outcomeCorrect` false. Insert the `debriefs` row with `overallScore(...)` and `modelUsed`, set session `complete`. On any throw set session `failed` and rethrow. Pick `DEBRIEF_MODEL` from the live gateway model list at build time, not from memory, and record the choice in `.env.example` as a comment.

- [ ] **Step 5: Wire in.** `end/route.ts`: when status becomes `debriefing`, `await runDebrief(sessionId)` inside try/catch and return `{ status }`; export `maxDuration = 60`. The call screen shows "Preparing your debrief…" while the POST is pending.

- [ ] **Step 6: Debrief page.** Ownership check as before. By status: `too_short` → "That call was under 20 seconds, so there is no debrief." + transcript; `failed` → "The debrief could not be produced." + a "Try again" button (server action calling `runDebrief`) + transcript; `complete` → in this order: an unsafe banner if `unsafeOutcome` ("Unsafe outcome: {scenario.unsafeOutcomes[0]}", red, top of page), overall score, "Outcome correct: Yes/No" with the expected outcome text, the seven rubric rows (label, 0–2 or "n/a", justification), strengths and improvements each with their quote, full transcript labelled Receptionist/Caller. If `clinicianApproved` is false, a notice: "Draft scenario. The answer key has not yet been checked by a GP against practice protocols."

- [ ] **Step 7: Verify by hand.** Scenario 3 twice: once processing the prescription and hanging up (expect unsafe banner, `outcome_correct` false); once asking about symptoms and advising 999 (expect no banner, red flag 2). Scenario 1 once (expect red flag "n/a"). Check every displayed quote appears in the transcript below it.

- [ ] **Step 8: Tests, typecheck, lint, commit** `feat: rubric debrief and debrief page`.

---

### Task 5: History, error handling, README

**Files:** `src/app/history/page.tsx`, `README.md`; modify `call-screen.tsx`, `use-call.ts`.

- [ ] **Step 1: History page.** `requireTrainee()`; sessions where `trainee_name` equals the cookie name, newest first, joined to scenario and debrief: date, scenario title, duration, status, score, unsafe marker, link to the debrief. Empty state: "No calls yet." Add a "Sign out" form that clears the cookie.

- [ ] **Step 2: Error cases, tested by hand.** (a) Block the microphone in Chrome site settings → the mic message appears and no session is left `in_call` (the start action only moves to `in_call` at token mint, so a blocked mic leaves it `created`). (b) Start a call, switch DevTools to Offline → "call dropped" message, turns so far saved. (c) Hang up after 5 seconds → `too_short`, no debrief row. (d) Open another trainee's `/debrief/{id}` under a different name → 404. (e) Reload the call page mid-call → page offers "Start again", which creates a new session; the old one stays without a debrief.

- [ ] **Step 3: README.** Sections: what it is; setup (Node version, `npm i`, Neon, env vars table, migrate, seed, dev); deploy to Vercel; how to add a scenario (edit `src/scenarios/seed.ts`, field-by-field guide, redeploy or `npm run db:seed`; set `clinicianApproved` only after GP sign-off); how the debrief is scored; known limitations — **shared access code and typed name are not authentication and must be replaced before any wider use**; anyone who types another trainee's name sees their history; patient prompt is readable in browser dev tools; realtime API is experimental and version-pinned; scenarios are unapproved drafts; English only; no audio stored; Chrome/Edge desktop only; practice-network WebSocket risk with what was observed in the spike.

- [ ] **Step 4: Run the "Done when" list from the brief end to end** on the deployed preview, all four scenarios, and record the result of each line in the PR description, including measured latency.

- [ ] **Step 5: Commit** `feat: history, error handling and README`.

---

## Needed from you before execution

1. An `AI_GATEWAY_API_KEY` (Vercel team with AI Gateway enabled) and which Vercel team/project to deploy to.
2. A Neon project, or permission to create one.
3. A value for `ACCESS_CODE`.
4. A yes/no on the three design decisions above (prompt visible in the browser, the extra `unsafe_outcome` column, 20-second rule).
5. Someone with a headset to run the Task 2 spike from the practice network; this environment has no microphone, so voice quality and latency cannot be checked here.
