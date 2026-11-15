import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scenarios } from '../../src/scenarios/seed';
import type { DebriefResult } from '../../src/debrief/rubric';
import {
  checkExpectations,
  formatCaseReport,
  formatSummary,
  parseArgs,
  recordFromResult,
  rescore,
  summarise,
  validateCase,
  wobble,
  type CaseFile,
} from './lib';

const s = (score: number) => ({ score, justification: 'x' });
const point = { point: 'p', quote: 'q' };
const result = (v: [number, number, number | null, number, number, number, number], over: Partial<DebriefResult> = {}): DebriefResult => ({
  rubricScores: { greeting: s(v[0]), information: s(v[1]), redFlag: v[2] === null ? null : s(v[2]), destination: s(v[3]), role: s(v[4]), explanation: s(v[5]), manner: s(v[6]) },
  outcomeCorrect: true,
  unsafeOutcome: false,
  redFlagHandled: v[2] === null ? null : true,
  strengths: [point, point],
  improvements: [point, point],
  ...over,
});

const caseFile = (over: Partial<CaseFile['expect']> = {}): CaseFile => ({
  name: 'c',
  scenarioId: 'angina-repeat',
  description: 'd',
  transcript: [{ speaker: 'patient', text: 'hello' }],
  expect: {
    outcomeCorrect: true,
    unsafeOutcome: false,
    redFlagHandled: true,
    flagsReason: 'r',
    scores: {
      greeting: { score: 2, reason: 'r' },
      information: { min: 1, max: 2, reason: 'r' },
      redFlag: { score: 2, reason: 'r' },
      destination: { score: 2, reason: 'r' },
      role: { score: 2, reason: 'r' },
      explanation: { min: 1, max: 2, reason: 'r' },
      manner: { min: 1, max: 2, reason: 'r' },
    },
    ...over,
  },
});

describe('checkExpectations', () => {
  it('passes when everything is within the expectation', () => {
    const checks = checkExpectations(caseFile(), result([2, 1, 2, 2, 2, 2, 1]));
    expect(checks).toHaveLength(10);
    expect(checks.every(c => c.pass)).toBe(true);
  });
  it('fails an exact score that differs and reports expected and actual', () => {
    const miss = checkExpectations(caseFile(), result([1, 2, 2, 2, 2, 2, 2])).filter(c => !c.pass);
    expect(miss).toEqual([{ id: 'greeting', pass: false, expected: '2', actual: '1' }]);
  });
  it('fails a score outside a range and accepts both ends', () => {
    expect(checkExpectations(caseFile(), result([2, 0, 2, 2, 2, 2, 2])).filter(c => !c.pass).map(c => c.id)).toEqual(['information']);
    const miss = checkExpectations(caseFile(), result([2, 1, 2, 2, 2, 2, 2]));
    expect(miss.every(c => c.pass)).toBe(true);
    expect(checkExpectations(caseFile(), result([2, 2, 2, 2, 2, 1, 1])).every(c => c.pass)).toBe(true);
  });
  it('checks the three flags only when the case states them', () => {
    const c = caseFile({ outcomeCorrect: undefined, unsafeOutcome: undefined, redFlagHandled: undefined });
    const checks = checkExpectations(c, result([2, 2, 2, 2, 2, 2, 2], { outcomeCorrect: false, unsafeOutcome: true }));
    expect(checks.map(k => k.id)).not.toContain('outcomeCorrect');
    expect(checks).toHaveLength(7);
  });
  it('fails a wrong flag', () => {
    const miss = checkExpectations(caseFile(), result([2, 2, 2, 2, 2, 2, 2], { unsafeOutcome: true })).filter(c => !c.pass);
    expect(miss).toEqual([{ id: 'unsafeOutcome', pass: false, expected: 'false', actual: 'true' }]);
  });
  it('expects a null red flag item for a scenario without a red flag, and fails if the model scored one', () => {
    const c = caseFile({ redFlagHandled: null, scores: { ...caseFile().expect.scores, redFlag: null } });
    expect(checkExpectations(c, result([2, 2, null, 2, 2, 2, 2])).every(k => k.pass)).toBe(true);
    const miss = checkExpectations(c, result([2, 2, 1, 2, 2, 2, 2], { redFlagHandled: null })).filter(k => !k.pass);
    expect(miss).toEqual([{ id: 'redFlag', pass: false, expected: 'n/a', actual: '1' }]);
  });
});

describe('wobble', () => {
  const rec = (name: string, run: number, v: [number, number, number | null, number, number, number, number]) =>
    recordFromResult({ ...caseFile(), name }, run, 1000, result(v), 0);
  it('counts cases whose runs gave different scores, per item', () => {
    const records = [
      rec('a', 1, [2, 2, 2, 2, 2, 2, 2]),
      rec('a', 2, [1, 2, 2, 2, 2, 2, 2]),
      rec('a', 3, [2, 2, 2, 2, 2, 1, 2]),
      rec('b', 1, [2, 2, 2, 2, 2, 2, 2]),
      rec('b', 2, [2, 2, 2, 2, 2, 2, 2]),
    ];
    const w = Object.fromEntries(wobble(records).map(x => [x.item, x]));
    expect(w.greeting).toEqual({ item: 'greeting', cases: 2, disagreeing: 1 });
    expect(w.explanation.disagreeing).toBe(1);
    expect(w.manner.disagreeing).toBe(0);
  });
  it('ignores cases with fewer than two completed runs and failed runs', () => {
    const records = [rec('a', 1, [2, 2, 2, 2, 2, 2, 2]), { case: 'a', scenarioId: 'x', run: 2, ms: 1, error: 'boom' }, rec('b', 1, [0, 0, 0, 0, 0, 0, 0])];
    expect(wobble(records).every(x => x.cases === 0 && x.disagreeing === 0)).toBe(true);
  });
});

describe('summarise and formatting', () => {
  const records = [
    recordFromResult(caseFile(), 1, 2000, result([2, 2, 2, 2, 2, 2, 2]), 1),
    recordFromResult(caseFile(), 2, 4000, result([1, 2, 2, 2, 2, 2, 2]), 0),
    { case: 'c', scenarioId: 'angina-repeat', run: 3, ms: 10, error: 'gateway down' },
  ];
  const sum = summarise(records);
  it('totals checks, ignoring failed runs', () => {
    expect(sum.runs).toBe(3);
    expect(sum.failedRuns).toBe(1);
    expect(sum.checksTotal).toBe(20);
    expect(sum.checksPassed).toBe(19);
    expect(sum.byCheck.greeting).toEqual({ passed: 1, total: 2 });
    expect(sum.casesWithMisses).toEqual(['c']);
  });
  it('averages time and counts dropped feedback points', () => {
    expect(sum.avgMs).toBe(3000);
    expect(sum.droppedPoints).toBe(1);
    expect(sum.feedbackPoints).toBe(9);
    expect(sum.avgOverall).toBeCloseTo(96.5);
  });
  it('prints a summary with every item, the totals and the wobble', () => {
    const text = formatSummary(sum, { model: 'm', promptVersion: 'v', cases: 1, runsPerCase: 3 });
    expect(text).toContain('model m, prompt v, 1 cases x 3 runs (3 assessments, 1 failed)');
    expect(text).toMatch(/greeting\s+1\/2 50%\s+1\/1 cases 100%/);
    expect(text).toContain('All expectations met: 19/20 (95%)');
    expect(text).toContain('dropped (quote not in transcript): 1 of 9');
    expect(text).toContain('Average time per debrief: 3.0s');
  });
  it('prints misses and errors per case', () => {
    const text = formatCaseReport(caseFile(), records);
    expect(text).toContain('MISS greeting: expected 2, got 1');
    expect(text).toContain('run 3: ERROR gateway down');
    expect(text).toContain('run 1: 10/10 met');
  });
});

describe('rescore', () => {
  it('re-checks stored results against changed expectations and leaves failed runs alone', () => {
    const stored = recordFromResult(caseFile(), 1, 1, result([1, 2, 2, 2, 2, 2, 2]), 0);
    expect(stored.checks!.some(c => !c.pass)).toBe(true);
    const relaxed = caseFile();
    relaxed.expect.scores.greeting = { min: 1, max: 2, reason: 'r' };
    const failed = { case: 'c', scenarioId: 'angina-repeat', run: 2, ms: 1, error: 'x' };
    const [a, b] = rescore([stored, failed], [relaxed]);
    expect(a.checks!.every(c => c.pass)).toBe(true);
    expect(b).toBe(failed);
  });
});

describe('parseArgs', () => {
  it('has defaults', () => expect(parseArgs([])).toEqual({ runs: 3, concurrency: 4 }));
  it('reads every flag', () =>
    expect(parseArgs(['--runs', '5', '--case', 'x', '--json', 'out.json', '--concurrency', '2'])).toEqual({ runs: 5, concurrency: 2, caseName: 'x', jsonPath: 'out.json' }));
  it('rejects bad input', () => {
    expect(() => parseArgs(['--runs', '0'])).toThrow();
    expect(() => parseArgs(['--case'])).toThrow();
    expect(parseArgs(['--rescore', 'a.json']).rescorePath).toBe('a.json');
    expect(() => parseArgs(['--nope'])).toThrow('Unknown argument');
  });
});

describe('the case files on disk', () => {
  const dir = path.join(import.meta.dirname, 'cases');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const hasRed = (id: string) => {
    const sc = scenarios.find(x => x.id === id);
    return sc ? sc.redFlags.length > 0 : undefined;
  };
  it('has at least 14 cases covering all four scenarios', () => {
    expect(files.length).toBeGreaterThanOrEqual(14);
    const ids = new Set(files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).scenarioId));
    expect([...ids].sort()).toEqual(scenarios.map(x => x.id).sort());
  });
  for (const f of files) {
    it(`${f} is well formed and named after its file`, () => {
      const c = validateCase(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f, hasRed);
      expect(`${c.name}.json`).toBe(f);
    });
  }
  it('rejects a case with a missing reason', () => {
    const c = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
    c.expect.scores.greeting = { score: 2 };
    expect(() => validateCase(c, 'x.json', hasRed)).toThrow('greeting has no reason');
  });
});
