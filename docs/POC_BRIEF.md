# Care Navigation Voice Trainer: proof-of-concept brief

## What we are building

A browser-based training tool for GP receptionists in Wales. The trainee picks a scenario and has a spoken conversation with an AI playing a patient phoning the practice. The trainee's job is to navigate the caller to the right service. When the call ends, the app shows a transcript and a scored debrief.

This is a proof of concept for a single GP practice. The goal is to find out whether staff find it realistic and useful, not to build a product.

## Scope

In scope:

- English only
- One practice, a handful of users
- 4 seed scenarios (below), stored as data so more can be added without code changes
- Live voice conversation in the browser (microphone in, audio out)
- Transcript saved per session
- Automated debrief scored against a rubric
- A simple session history page per trainee

Out of scope for the PoC:

- Welsh language
- Multi-tenancy, organisations, billing
- Real authentication (see Access below)
- Manager dashboards and reporting
- Storing audio recordings (store transcripts only)
- Any real patient data, anywhere

## Stack

- Next.js (App Router, TypeScript) deployed on Vercel
- Neon Postgres for data (use Drizzle or Prisma, whichever is quicker to set up)
- Vercel AI Gateway for all model access, via the AI SDK
- Realtime voice model: `openai/gpt-realtime-2.1` through the gateway
- Debrief model: a strong text model through the gateway, set by env var

Important: AI Gateway realtime support is in beta (AI SDK 7) and the API surface may differ from what you remember. Read the current Vercel AI Gateway realtime quickstart and AI SDK docs before writing the voice code. Do not rely on memory for function names or model IDs; check the gateway model list.

## Architecture

1. Trainee opens the app, enters the access code and their name, and picks a scenario.
2. The server creates a session row and mints a short-lived realtime token. The gateway API key never reaches the browser.
3. The browser connects to the realtime model over WebSocket using the AI SDK realtime hook, which handles microphone capture and playback.
4. The session is configured with the patient system prompt built from the scenario. The AI speaks first, as a caller would ("Hello, is that the surgery?").
5. Transcript turns (both sides) are captured as the call runs and saved when it ends.
6. On hang-up, the server sends the transcript, the scenario's answer key and the rubric to the debrief model and stores the structured result.
7. The trainee sees the debrief page.

Keep the patient model and the debrief model completely separate. The patient never assesses; the assessor never role-plays.

## Access

No real auth for the PoC. A single shared access code (env var) gates the app, and the trainee types their name, which is stored against their sessions. Flag clearly in the README that this must be replaced before any wider use.

## Data model

- `scenarios`: id, title, difficulty, persona (JSON), opening_line, presenting_story, hidden_facts (JSON array of fact plus what unlocks it), emotional_state, correct_outcome, acceptable_alternatives, red_flags (JSON), unsafe_outcomes, clinician_approved (boolean), active
- `sessions`: id, trainee_name, scenario_id, started_at, ended_at, duration_seconds, status
- `transcript_turns`: id, session_id, speaker (trainee or patient), text, sequence
- `debriefs`: id, session_id, overall_score, outcome_correct (boolean), red_flag_handled (boolean or null), rubric_scores (JSON), strengths (JSON), improvements (JSON), quoted_moments (JSON), model_used

Seed scenarios from a JSON or TypeScript file so they can be edited easily.

## Patient prompt rules

Build the system prompt from the scenario. It must make the model:

- Stay in character as a member of the public phoning a GP surgery in South Wales. Never mention being an AI, a simulation or training.
- Speak naturally and briefly, as people do on the phone. No lists, no clinical vocabulary the persona would not use.
- Volunteer only the presenting story. Reveal each hidden fact only when the trainee asks a question that would reasonably elicit it.
- Hold the emotional state defined in the scenario, and soften or escalate in response to how the trainee handles them.
- Push back realistically when offered an alternative to a GP appointment, but accept a clear, well-explained plan.
- Never give the trainee the answer or coach them.
- End the call naturally once a plan is agreed or the trainee ends it.

Use a British English voice. Start with low reasoning effort for latency.

## Debrief rubric

Score each item 0 to 2 with a one-line justification, and return structured JSON:

1. Greeting and identification (name, checks who is calling and for whom)
2. Information gathering (asked enough to navigate safely, including the questions that unlock hidden facts)
3. Red flag recognition (spotted and acted on it; null if the scenario has none)
4. Correct destination (matches the answer key or an acceptable alternative)
5. Stayed in role (no diagnosis or clinical advice beyond the receptionist's remit)
6. Explanation (told the caller where they are going, why, and what to do if things get worse)
7. Manner (empathy, clarity, handling of emotion or pushback)

The debrief must also include: whether the outcome was correct, two or three strengths, two or three specific improvements, and direct quotes from the transcript supporting each point. Instruct the model to judge only against the scenario's answer key and rubric, and not to introduce its own clinical opinions.

## Seed scenarios

These are drafts. Every scenario has `clinician_approved: false` until a GP has checked the answer key against the practice's own protocols.

1. **Sore throat (easy).** Adult, 2 days of sore throat, otherwise well, wants a GP appointment for antibiotics. No red flags. Hidden if asked: no difficulty swallowing fluids, no breathing difficulty, not immunosuppressed. Expected outcome: community pharmacy (Common Ailments Scheme / sore throat test and treat where available), with advice to call back if worse.
2. **Flashes and floaters (medium).** Adult in their 60s, asks for a routine GP appointment about "something in my eye". Hidden if asked: sudden onset this morning of flashing lights and new floaters in one eye. Expected outcome: same-day urgent assessment by an optometrist (Wales General Ophthalmic Services), not a routine GP slot.
3. **Repeat prescription with buried red flag (hard).** Older man phoning to chase a repeat prescription for his angina spray. Mentions in passing that he has used a lot of it. Hidden if asked: chest tightness at rest right now, started 30 minutes ago, not eased by the spray. Expected outcome: recognise the red flag, advise 999 immediately and follow practice emergency protocol. Unsafe outcome: processing the prescription request and ending the call.
4. **Low mood, vague caller (hard).** Younger adult, hesitant, says they "just need to see someone" and will not say why at first. Hidden if asked sensitively: weeks of low mood, not sleeping, and thoughts that people would be better off without them. Expected outcome: treat as urgent, same-day contact with the duty clinician per practice protocol, and give NHS 111 press 2 for urgent mental health support. Unsafe outcome: routine appointment in two weeks.

## Pages

- `/` access code, name entry, scenario list with difficulty
- `/call/[sessionId]` call screen: start, live status (listening or speaking), elapsed time, hang up. No live transcript on screen, to keep it feeling like a phone call.
- `/debrief/[sessionId]` scores, strengths, improvements, quoted moments, full transcript
- `/history` the trainee's past sessions

Keep the UI plain and large. It will be used on reception desktops with a headset.

## Environment variables

- `AI_GATEWAY_API_KEY`
- `DATABASE_URL` (Neon)
- `ACCESS_CODE`
- `REALTIME_MODEL` (default `openai/gpt-realtime-2.1`)
- `DEBRIEF_MODEL`

## Build order

1. Scaffold the app, database schema, migrations and scenario seed.
2. Get a bare voice conversation working end to end with a hard-coded prompt. This is the riskiest part, so do it first.
3. Wire scenarios into the patient prompt and capture transcripts.
4. Build the debrief call and page.
5. Add history, the access gate and basic error handling (microphone denied, connection dropped, call under 20 seconds).
6. Write a README covering setup, env vars, how to add a scenario, and known limitations.

## Done when

- A trainee can complete each of the 4 scenarios by voice in Chrome or Edge with a headset.
- Response latency feels conversational (target under about one second).
- The patient stays in character and only reveals hidden facts when asked.
- Each completed call produces a saved transcript and a debrief with rubric scores and quotes.
- In scenario 3, a call that misses the chest pain is marked as an unsafe outcome in the debrief.
- A new scenario can be added by editing the seed file only.

## Things to flag back rather than decide alone

- If the gateway's realtime beta cannot do something needed (for example, transcripts of both sides), say so and propose connecting to the provider directly instead.
- If WebSocket audio is blocked or unreliable in testing, note it; the practice network is a known risk.
- Do not add analytics, third-party scripts or audio storage without asking.
