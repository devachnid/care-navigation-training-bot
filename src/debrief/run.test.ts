import { describe, expect, it } from 'vitest';
import { enforceRules } from './run';
import type { DebriefResult } from './rubric';

const s = (score: number) => ({ score, justification: 'x' });
const base = (over: Partial<DebriefResult> = {}): DebriefResult => ({
  rubricScores: { greeting: s(2), information: s(1), redFlag: s(0), destination: s(0), role: s(2), explanation: s(1), manner: s(2) },
  outcomeCorrect: true,
  unsafeOutcome: false,
  redFlagHandled: false,
  strengths: [
    { point: 'a', quote: 'what is the name please' },
    { point: 'b', quote: 'never said' },
  ],
  improvements: [{ point: 'c', quote: "I've used a lot of it" }],
  ...over,
});
const lines = ['Of course, what is the name please?', "I've used a lot of it lately."];

describe('enforceRules', () => {
  it('marks a missed red flag with the wrong destination as unsafe, whatever the model said', () => {
    const r = enforceRules(base({ outcomeCorrect: false }), true, lines);
    expect(r.unsafeOutcome).toBe(true);
    expect(r.outcomeCorrect).toBe(false);
  });
  it('does not call it unsafe when the red flag was not drawn out but the caller was sent to the right place', () => {
    const r = enforceRules(base({ outcomeCorrect: true, redFlagHandled: false }), true, lines);
    expect(r.unsafeOutcome).toBe(false);
    expect(r.outcomeCorrect).toBe(true);
  });
  it('never lets an unsafe outcome count as correct', () => {
    const r = enforceRules(base({ outcomeCorrect: true, unsafeOutcome: true, redFlagHandled: true }), true, lines);
    expect(r.outcomeCorrect).toBe(false);
  });
  it('keeps at most three points of each kind when the model returns more', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ point: `p${i}`, quote: 'what is the name please' }));
    const r = enforceRules(base({ strengths: many, improvements: many }), true, lines);
    expect(r.strengths.map(p => p.point)).toEqual(['p0', 'p1', 'p2']);
    expect(r.improvements).toHaveLength(3);
  });
  it('leaves a handled red flag alone', () => {
    const r = enforceRules(base({ redFlagHandled: true }), true, lines);
    expect(r.unsafeOutcome).toBe(false);
    expect(r.outcomeCorrect).toBe(true);
  });
  it('nulls red flag fields when the scenario has none', () => {
    const r = enforceRules(base(), false, lines);
    expect(r.rubricScores.redFlag).toBeNull();
    expect(r.redFlagHandled).toBeNull();
    expect(r.unsafeOutcome).toBe(false);
  });
  it('drops points whose quote is not in the transcript', () => {
    const r = enforceRules(base(), true, lines);
    expect(r.strengths.map(p => p.point)).toEqual(['a']);
    expect(r.improvements).toHaveLength(1);
  });
  it('does not mutate its input', () => {
    const input = base();
    enforceRules(input, false, lines);
    expect(input.rubricScores.redFlag).not.toBeNull();
  });
});
