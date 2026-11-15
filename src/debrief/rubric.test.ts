import { describe, expect, it } from 'vitest';
import { RUBRIC, overallScore, type RubricScores } from './rubric';

describe('RUBRIC', () => {
  it('keeps the seven keys in the order the debrief page shows them', () => {
    expect(RUBRIC.map(r => r.key)).toEqual(['greeting', 'information', 'redFlag', 'destination', 'role', 'explanation', 'manner']);
  });
  it('has a label, a guide and a distinct non-empty anchor for each of 0, 1 and 2', () => {
    for (const r of RUBRIC) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.guide.length).toBeGreaterThan(0);
      const anchors = [r.anchors[0], r.anchors[1], r.anchors[2]];
      for (const a of anchors) expect(a.trim().length).toBeGreaterThan(10);
      expect(new Set(anchors).size).toBe(3);
    }
  });
  it('anchors the greeting item on the practice or own name, the caller, and who the call is for', () => {
    const g = RUBRIC[0];
    expect(g.anchors[2]).toMatch(/own name or the practice name/);
    expect(g.anchors[2]).toMatch(/whether the call is for the caller or for someone else/);
  });
});

const s = (score: number) => ({ score, justification: 'x' });
const scores = (v: [number, number, number | null, number, number, number, number]): RubricScores => ({
  greeting: s(v[0]),
  information: s(v[1]),
  redFlag: v[2] === null ? null : s(v[2]),
  destination: s(v[3]),
  role: s(v[4]),
  explanation: s(v[5]),
  manner: s(v[6]),
});

describe('overallScore', () => {
  it('is 100 for full marks with no red flag item', () => expect(overallScore(scores([2, 2, null, 2, 2, 2, 2]))).toBe(100));
  it('is 100 for full marks with a red flag item', () => expect(overallScore(scores([2, 2, 2, 2, 2, 2, 2]))).toBe(100));
  it('is 0 for no marks', () => expect(overallScore(scores([0, 0, 0, 0, 0, 0, 0]))).toBe(0));
  it('is 50 for all ones', () => expect(overallScore(scores([1, 1, null, 1, 1, 1, 1]))).toBe(50));
  it('rounds a mixed result over applicable items only', () => expect(overallScore(scores([2, 2, null, 0, 2, 1, 1]))).toBe(67));
  it('counts a zero red flag item against the total', () => expect(overallScore(scores([2, 2, 0, 2, 2, 2, 2]))).toBe(86));
});
