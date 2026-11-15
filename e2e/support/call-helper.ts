/**
 * Finishes a call that a person started in the browser, without a microphone.
 *
 * Run with `npx tsx --env-file=.env.local e2e/support/call-helper.ts` by `e2e/support/call.ts`.
 * It uses the same backend functions the app uses, as the person who owns the call: sign in,
 * `claimForToken` (what the token route does), `endCall` (what the end route does), `saveDebrief`
 * (what the debrief run does, with scores written here instead of by the model). It writes nothing
 * with raw SQL. Input comes from the environment so no password is on a command line:
 *   E2E_HELPER_EMAIL, E2E_HELPER_PASSWORD, E2E_HELPER_SESSION_ID, E2E_HELPER_OPTIONS (JSON).
 * It prints one line of JSON: { ok: true, status } or { ok: false, error }.
 */
import { loadActor } from '@/auth/sessions';
import { signIn, signOut } from '@/auth/sign-in';
import { claimForToken, endCall, saveDebrief, type DebriefValues } from '@/sessions/dal';

type Options = {
  score: number;
  outcomeCorrect: boolean;
  unsafeOutcome: boolean;
  durationSeconds: number;
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

async function main(): Promise<void> {
  const email = process.env.E2E_HELPER_EMAIL ?? '';
  const password = process.env.E2E_HELPER_PASSWORD ?? '';
  const sessionId = process.env.E2E_HELPER_SESSION_ID ?? '';
  const options: Options = {
    score: 85,
    outcomeCorrect: true,
    unsafeOutcome: false,
    durationSeconds: 150,
    ...JSON.parse(process.env.E2E_HELPER_OPTIONS ?? '{}'),
  };

  const signedIn = await signIn({ email, password, ip: null });
  if (!signedIn.ok) throw new Error(`sign-in failed: ${signedIn.error}`);
  try {
    const actor = await loadActor(signedIn.token);
    if (!actor) throw new Error('no actor for the helper session');

    const claimed = await claimForToken(actor, sessionId);
    if (!claimed.ok) throw new Error(`claimForToken: ${claimed.error}`);

    // endCall never trusts the browser's clock beyond the time since the call started, so it is told that the
    // call ends `durationSeconds` from now (it was started a moment ago, in the browser).
    const endAt = new Date(Date.now() + options.durationSeconds * 1000);
    const ended = await endCall(actor, sessionId, { durationSeconds: options.durationSeconds, turns: TURNS }, endAt);
    if (!ended.ok) throw new Error(`endCall: ${ended.error}`);
    if (!ended.needsDebrief) throw new Error(`endCall did not ask for a debrief (status ${ended.status})`);

    const saved = await saveDebrief(actor, sessionId, debriefValues(options));
    if (!saved) throw new Error('saveDebrief refused');
    console.log(JSON.stringify({ ok: true, status: 'complete' }));
  } finally {
    await signOut(signedIn.token);
  }
}

main().then(
  () => process.exit(0),
  err => {
    console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  },
);
