import { describe, expect, it } from 'vitest';
import { overallScore, type RubricScores } from './rubric';

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
