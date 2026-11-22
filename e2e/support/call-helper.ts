/**
 * Does, without a microphone, the parts of a call the pages cannot.
 *
 * Run with `npx tsx --env-file=.env.local e2e/support/call-helper.ts` by `e2e/support/call.ts`.
 * It uses the same backend functions the app uses, as the person who owns the call: sign in,
 * `startCall`, `claimForToken` (what the token route does), `endCall` (what the end route does) and
 * `saveDebrief` (what the debrief run does, with scores written here instead of by the model). It
 * writes nothing with raw SQL. Input comes from the environment so no password is on a command line:
 *   E2E_HELPER_EMAIL, E2E_HELPER_PASSWORD, E2E_HELPER_MODE, E2E_HELPER_OPTIONS (JSON), and for
 *   `finish` and `too-short` E2E_HELPER_SESSION_ID (a call started in the browser).
 * Modes:
 *   finish     connect the call, end it after `durationSeconds`, save a debrief.
 *   too-short  connect the call and end it after a few seconds: recorded as a fail scoring 0.
 *   old        start a call on `scenarioTitle` as if `daysAgo` days ago, then finish it as above.
 * It prints one line of JSON: { ok: true, sessionId } or { ok: false, error }.
 */
import { loadActor } from '@/auth/sessions';
import { signIn, signOut } from '@/auth/sign-in';
import type { Actor } from '@/policy/actor';
import { listVisibleScenarios } from '@/scenarios/practice-dal';
import { claimForToken, endCall, saveDebrief, startCall, type DebriefValues } from '@/sessions/dal';

type Options = {
  score: number;
  outcomeCorrect: boolean;
  unsafeOutcome: boolean;
  durationSeconds: number;
  scenarioTitle: string;
  daysAgo: number;
};

const item = (score: number, justification: string) => ({ score, justification });

const TURNS = [
  { speaker: 'patient' as const, text: 'Hello, is that the surgery? I need an appointment with the doctor please.' },
  { speaker: 'trainee' as const, text: 'Good morning, e2e test surgery, this is the receptionist. Who am I speaking to?' },
  { speaker: 'patient' as const, text: 'It is the e2e caller. I have had a sore throat for two days.' },
  { speaker: 'trainee' as const, text: 'I can book you with the pharmacist today. Please call back if it gets worse.' },
];

function debriefValues(o: Options): DebriefValues {
  return {
    overallScore: o.score,
    outcomeCorrect: o.outcomeCorrect,
    unsafeOutcome: o.unsafeOutcome,
    redFlagHandled: null,
    rubricScores: {
      greeting: item(2, 'Gave a greeting and asked who was calling.'),
      information: item(1, 'Asked about the symptom but not how bad it was.'),
      redFlag: null,
      destination: item(2, 'Offered the pharmacy, which matches the answer key.'),
      role: item(2, 'Gave no clinical advice.'),
      explanation: item(1, 'Said to call back if worse.'),
      manner: item(2, 'Polite and clear.'),
    },
    strengths: [
      { point: 'You asked who was calling.', quote: 'Who am I speaking to?' },
      { point: 'You offered a safe destination.', quote: 'I can book you with the pharmacist today.' },
    ],
    improvements: [
      { point: 'Say more about what to do if it gets worse.', quote: 'Please call back if it gets worse.' },
      { point: 'Ask how long the symptom has lasted.', quote: 'Who am I speaking to?' },
    ],
    quotedMoments: [],
    modelUsed: 'e2e helper (no model)',
    promptVersion: 'e2e',
  };
}

/**
 * Connects the call at `at` (server time as far as the app can tell), ends it `seconds` later, and
 * returns whether it needs a debrief. `endCall` is given the later time as `now`, so the transcript
 * is plausible for the connected time.
 */
async function connectAndEnd(actor: Actor, sessionId: string, at: Date, seconds: number, turns: typeof TURNS) {
  const claimed = await claimForToken(actor, sessionId, at);
  if (!claimed.ok) throw new Error(`claimForToken: ${claimed.error}`);
  const endAt = new Date(at.getTime() + seconds * 1000);
  const ended = await endCall(actor, sessionId, { durationSeconds: seconds, turns }, endAt);
  if (!ended.ok) throw new Error(`endCall: ${ended.error}`);
  return ended;
}

async function main(): Promise<string> {
  const email = process.env.E2E_HELPER_EMAIL ?? '';
  const password = process.env.E2E_HELPER_PASSWORD ?? '';
  const mode = process.env.E2E_HELPER_MODE ?? 'finish';
  const options: Options = {
    score: 85,
    outcomeCorrect: true,
    unsafeOutcome: false,
    durationSeconds: 150,
    scenarioTitle: 'Sore throat',
    daysAgo: 0,
    ...JSON.parse(process.env.E2E_HELPER_OPTIONS ?? '{}'),
  };

  const signedIn = await signIn({ email, password, ip: null });
  if (!signedIn.ok) throw new Error(`sign-in failed: ${signedIn.error}`);
  try {
    const actor = await loadActor(signedIn.token);
    if (!actor) throw new Error('no actor for the helper session');

    if (mode === 'old') {
      const scenario = (await listVisibleScenarios(actor)).find(s => s.title === options.scenarioTitle);
      if (!scenario) throw new Error(`no scenario called ${options.scenarioTitle}`);
      const at = new Date(Date.now() - options.daysAgo * 86_400_000);
      const started = await startCall(actor, scenario.id, at);
      if (!started.ok) throw new Error(`startCall: ${started.error}`);
      const ended = await connectAndEnd(actor, started.sessionId, at, options.durationSeconds, TURNS);
      if (!ended.needsDebrief) throw new Error(`endCall did not ask for a debrief (status ${ended.status})`);
      if (!(await saveDebrief(actor, started.sessionId, debriefValues(options)))) throw new Error('saveDebrief refused');
      return started.sessionId;
    }

    const sessionId = process.env.E2E_HELPER_SESSION_ID ?? '';
    // The call was started in the browser a moment ago, so "now" is when it connects.
    const at = new Date();
    if (mode === 'too-short') {
      const ended = await connectAndEnd(actor, sessionId, at, 5, TURNS.slice(0, 2));
      if (ended.status !== 'too_short') throw new Error(`expected too_short, got ${ended.status}`);
      return sessionId;
    }
    const ended = await connectAndEnd(actor, sessionId, at, options.durationSeconds, TURNS);
    if (!ended.needsDebrief) throw new Error(`endCall did not ask for a debrief (status ${ended.status})`);
    if (!(await saveDebrief(actor, sessionId, debriefValues(options)))) throw new Error('saveDebrief refused');
    return sessionId;
  } finally {
    await signOut(signedIn.token);
  }
}

main().then(
  sessionId => {
    console.log(JSON.stringify({ ok: true, sessionId }));
    process.exit(0);
  },
  err => {
    console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  },
);
