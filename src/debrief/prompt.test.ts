import { describe, expect, it } from 'vitest';
import { scenarios } from '@/scenarios/seed';
import { buildDebriefPrompt } from './prompt';
import { RUBRIC } from './rubric';

const angina = scenarios.find(s => s.id === 'angina-repeat')!;
const sore = scenarios.find(s => s.id === 'sore-throat')!;
const turns = [
  { speaker: 'patient' as const, text: "Oh hello, I'm ringing about my prescription." },
  { speaker: 'trainee' as const, text: 'Of course, what is the name please?' },
  { speaker: 'patient' as const, text: 'Gwilym Pritchard.' },
];

describe('buildDebriefPrompt', () => {
  const p = buildDebriefPrompt(angina, turns);
  it('includes the answer key', () => {
    expect(p).toContain(angina.correctOutcome);
    for (const u of angina.unsafeOutcomes) expect(p).toContain(u);
    for (const h of angina.hiddenFacts) expect(p).toContain(h.fact);
  });
  it('includes every rubric item', () => {
    for (const r of RUBRIC) expect(p).toContain(r.label);
  });
  it('numbers and labels the transcript', () => {
    expect(p).toContain("[1] CALLER: Oh hello, I'm ringing about my prescription.");
    expect(p).toContain('[2] RECEPTIONIST: Of course, what is the name please?');
  });
  it('restricts the assessor to the answer key and forbids role-play', () => {
    expect(p).toContain('Judge only against the answer key and rubric below');
    expect(p).toContain('Do not add your own clinical opinion');
    expect(p).toContain('you never role-play');
  });
  it('keeps suggested improvements inside the answer key', () => {
    expect(p).toContain('Improvements must come only from the rubric and the answer key');
    expect(p).toContain('no first aid');
  });
  it('treats a missed red flag as unsafe', () => {
    expect(p).toContain('or if the call ended without the red flag being acted on');
  });
  it('marks red flag items not applicable when the scenario has none', () => {
    expect(buildDebriefPrompt(sore, turns)).toContain(
      'This scenario has no red flag. Set redFlag to null and redFlagHandled to null.',
    );
  });
});
