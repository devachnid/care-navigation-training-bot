import type { Scenario } from './types';

/**
 * Training scenarios. This is the only file to edit to add or change one;
 * `npm run db:seed` (run automatically on every deploy) copies it to the database.
 *
 * All callers are invented. Never put real patient details here.
 * Leave `clinicianApproved: false` until a GP has checked the answer key
 * against the practice's own protocols.
 */
export const scenarios: Scenario[] = [
  {
    id: 'sore-throat',
    title: 'Sore throat',
    difficulty: 'easy',
    persona: {
      name: 'Carys Bevan',
      age: 34,
      description: 'Works in an office, busy, generally healthy. Friendly but wants this sorted today.',
    },
    voice: 'coral',
    openingLine: "Hello, is that the surgery? I need an appointment with the doctor please.",
    presentingStory:
      'She has had a sore throat for 2 days and wants a GP appointment to get antibiotics. Otherwise she feels well.',
    hiddenFacts: [
      { fact: 'She can swallow drinks without any difficulty.', unlockedBy: 'Asked whether she can swallow, eat or drink.' },
      { fact: 'She has no difficulty breathing.', unlockedBy: 'Asked about her breathing.' },
      {
        fact: 'She has no long-term conditions and takes no medicines that weaken the immune system.',
        unlockedBy: 'Asked about other health conditions, regular medication or her immune system.',
      },
    ],
    emotionalState:
      'Pleasant but a little impatient. Convinced she needs antibiotics and that only a doctor can give them.',
    correctOutcome:
      'Community pharmacy (Common Ailments Scheme / sore throat test and treat where available), with advice to call back if worse.',
    acceptableAlternatives: [],
    redFlags: [],
    unsafeOutcomes: [],
    clinicianApproved: false,
    active: true,
  },
  {
    id: 'flashes-floaters',
    title: 'Flashes and floaters',
    difficulty: 'medium',
    persona: {
      name: 'Delyth Morgan',
      age: 66,
      description: 'Retired teacher, polite and matter-of-fact, does not want to waste anyone\'s time.',
    },
    voice: 'coral',
    openingLine: "Good morning, is that the surgery? I'd like to book a routine appointment with the doctor, please.",
    presentingStory: 'She asks for a routine GP appointment about "something in my eye". She says no more than that unless asked.',
    hiddenFacts: [
      {
        fact: 'She has been seeing flashing lights in one eye.',
        unlockedBy: 'Asked what is wrong with the eye, what she is noticing, or what the symptoms are.',
      },
      {
        fact: 'She has new floaters, like little black specks or cobwebs, in the same eye.',
        unlockedBy: 'Asked what is wrong with the eye, or whether there is anything else she can see.',
      },
      { fact: 'It came on suddenly this morning.', unlockedBy: 'Asked when it started or how quickly it came on.' },
      { fact: 'It is only in one eye and it does not hurt.', unlockedBy: 'Asked which eye, whether both eyes, or whether it is painful.' },
    ],
    emotionalState:
      'Calm and unworried, assumes it is something minor. Becomes concerned but cooperative if told it needs looking at today.',
    correctOutcome:
      'Same-day urgent assessment by an optometrist (Wales General Ophthalmic Services), not a routine GP slot.',
    acceptableAlternatives: [],
    redFlags: ['Sudden onset this morning of flashing lights and new floaters in one eye'],
    unsafeOutcomes: ['Booking a routine GP appointment and ending the call.'],
    clinicianApproved: false,
    active: true,
  },
  {
    id: 'angina-repeat',
    title: 'Repeat prescription with buried red flag',
    difficulty: 'hard',
    persona: {
      name: 'Gwilym Pritchard',
      age: 74,
      description: 'Retired, lives alone, does not like to make a fuss.',
    },
    voice: 'ballad',
    openingLine: "Oh hello, is that the surgery? I'm ringing about my prescription.",
    presentingStory:
      'He is chasing a repeat prescription for his angina spray. He mentions in passing that he has used a lot of it.',
    hiddenFacts: [
      {
        fact: 'He has a tight feeling in his chest right now, while sitting down resting.',
        unlockedBy: 'Asked how he is feeling now, or why he has used so much of the spray.',
      },
      { fact: 'It started about 30 minutes ago.', unlockedBy: 'Asked when it started or how long it has been going on.' },
      { fact: 'The spray has not eased it.', unlockedBy: 'Asked whether the spray has helped.' },
    ],
    emotionalState:
      'Calm and apologetic, plays it down. Becomes worried if the receptionist sounds alarmed, cooperative if they are clear and calm.',
    correctOutcome: 'Recognise the red flag, advise 999 immediately and follow practice emergency protocol.',
    acceptableAlternatives: [],
    redFlags: ['Chest tightness at rest right now, started 30 minutes ago, not eased by the spray'],
    unsafeOutcomes: ['Processing the prescription request and ending the call.'],
    clinicianApproved: false,
    active: true,
  },
  {
    id: 'low-mood',
    title: 'Low mood, vague caller',
    difficulty: 'hard',
    persona: {
      name: 'Rhys Jenkins',
      age: 26,
      description: 'Quiet, hesitant, finds phone calls hard. Long pauses, short answers.',
    },
    voice: 'ballad',
    openingLine: 'Hi... um, is that the doctors? I just need to see someone.',
    presentingStory:
      'He says he "just needs to see someone" and at first will not say why. He deflects direct questions with "it\'s personal" or "I\'d rather not say".',
    hiddenFacts: [
      {
        fact: 'He has been feeling very low for weeks.',
        unlockedBy: 'Asked gently and without pressure how he has been feeling, or reassured that he can share as much or as little as he likes.',
      },
      { fact: 'He is not sleeping.', unlockedBy: 'Asked sensitively how things have been, how he is coping, or about sleep.' },
      {
        fact: 'He has been having thoughts that people would be better off without him.',
        unlockedBy: 'After he has opened up about his mood, asked kindly whether things have got so bad that he has had dark thoughts or thoughts of harming himself.',
      },
    ],
    emotionalState:
      'Withdrawn, embarrassed and close to giving up on the call. Opens up slowly if the receptionist is patient and kind. Shuts down and says "it doesn\'t matter" if rushed, interrogated or put on hold.',
    correctOutcome:
      'Treat as urgent, same-day contact with the duty clinician per practice protocol, and give NHS 111 press 2 for urgent mental health support.',
    acceptableAlternatives: [],
    redFlags: ['Weeks of low mood, not sleeping, and thoughts that people would be better off without him'],
    unsafeOutcomes: ['Routine appointment in two weeks.'],
    clinicianApproved: false,
    active: true,
  },
];
