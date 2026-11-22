import { RUBRIC, overallScore, type DebriefResult, type RubricKey } from '../../src/debrief/rubric';

/**
 * Pure parts of the debrief evaluation: reading a case, checking an assessor answer against its
 * expectations, measuring how much repeated runs disagree, and printing the results. No network
 * and no files here, so all of it is unit-tested (`lib.test.ts`).
 */

export type Turn = { speaker: 'trainee' | 'patient'; text: string };

/** An exact score (`score`) or an allowed range (`min` to `max`), with the reason for the expectation. */
export type ScoreExpectation = { score: number; reason: string } | { min: number; max: number; reason: string };

export type CaseFile = {
  name: string;
  scenarioId: string;
  description: string;
  transcript: Turn[];
  expect: {
    /** A key left out is not checked: use that where an honest reader of the rubric could go either way. */
    outcomeCorrect?: boolean;
    unsafeOutcome?: boolean;
    /** null means the scenario has no red flag. */
    redFlagHandled?: boolean | null;
    flagsReason: string;
    /** null for redFlag means the scenario has no red flag. */
    scores: Record<RubricKey, ScoreExpectation | null>;
  };
};

export type Check = { id: string; pass: boolean; expected: string; actual: string };

const show = (v: boolean | number | null | undefined) => (v === null || v === undefined ? 'n/a' : String(v));

export function describeExpectation(e: ScoreExpectation | null): string {
  if (e === null) return 'n/a';
  if ('score' in e) return String(e.score);
  return e.min === e.max ? String(e.min) : `${e.min}-${e.max}`;
}

function scoreMatches(e: ScoreExpectation, actual: number): boolean {
  return 'score' in e ? actual === e.score : actual >= e.min && actual <= e.max;
}

/** Compares one assessor answer with a case's expectations. One check per expectation. */
export function checkExpectations(c: CaseFile, result: DebriefResult): Check[] {
  const checks: Check[] = [];
  const flag = (id: 'outcomeCorrect' | 'unsafeOutcome' | 'redFlagHandled') => {
    const want = c.expect[id];
    if (want === undefined) return;
    checks.push({ id, pass: result[id] === want, expected: show(want), actual: show(result[id]) });
  };
  flag('outcomeCorrect');
  flag('unsafeOutcome');
  flag('redFlagHandled');
  for (const r of RUBRIC) {
    const want = c.expect.scores[r.key];
    const got = result.rubricScores[r.key];
    if (want === null) checks.push({ id: r.key, pass: got === null, expected: 'n/a', actual: show(got?.score) });
    else checks.push({ id: r.key, pass: got !== null && scoreMatches(want, got.score), expected: describeExpectation(want), actual: show(got?.score) });
  }
  return checks;
}

/** What one assessor run produced (or why it failed). */
export type RunRecord = {
  case: string;
  scenarioId: string;
  run: number;
  ms: number;
  error?: string;
  droppedPoints?: number;
  overall?: number;
  checks?: Check[];
  result?: DebriefResult;
};

export function recordFromResult(c: CaseFile, run: number, ms: number, result: DebriefResult, droppedPoints: number): RunRecord {
  return { case: c.name, scenarioId: c.scenarioId, run, ms, droppedPoints, overall: overallScore(result.rubricScores), checks: checkExpectations(c, result), result };
}

/**
 * Re-checks stored results against the current case files, with no model calls. Used after
 * correcting an expectation, so an earlier run can be read against the corrected set.
 */
export function rescore(records: RunRecord[], cases: CaseFile[]): RunRecord[] {
  return records.map(r => {
    const c = cases.find(x => x.name === r.case);
    return c && r.result ? { ...r, checks: checkExpectations(c, r.result) } : r;
  });
}

const completed = (records: RunRecord[]) => records.filter(r => r.result !== undefined);

export type Wobble = { item: RubricKey; cases: number; disagreeing: number };

/**
 * For each rubric item: of the cases with at least two completed runs, in how many did the runs
 * not all give the same score. 0 means the assessor was repeatable on that item.
 */
export function wobble(records: RunRecord[]): Wobble[] {
  const byCase = new Map<string, RunRecord[]>();
  for (const r of completed(records)) byCase.set(r.case, [...(byCase.get(r.case) ?? []), r]);
  const groups = [...byCase.values()].filter(g => g.length >= 2);
  return RUBRIC.map(({ key }) => {
    let disagreeing = 0;
    for (const g of groups) {
      const scores = new Set(g.map(r => r.result!.rubricScores[key]?.score ?? null));
      if (scores.size > 1) disagreeing++;
    }
    return { item: key, cases: groups.length, disagreeing };
  });
}

export type Summary = {
  runs: number;
  failedRuns: number;
  checksPassed: number;
  checksTotal: number;
  /** Per check id (items and flags): passed and total. */
  byCheck: Record<string, { passed: number; total: number }>;
  wobble: Wobble[];
  /** Cases with at least one failed expectation in any run, in case order. */
  casesWithMisses: string[];
  droppedPoints: number;
  feedbackPoints: number;
  avgMs: number;
  avgOverall: number;
};

export function summarise(records: RunRecord[]): Summary {
  const done = completed(records);
  const byCheck: Summary['byCheck'] = {};
  let passed = 0;
  let total = 0;
  const misses: string[] = [];
  for (const r of done) {
    for (const ch of r.checks ?? []) {
      const e = (byCheck[ch.id] ??= { passed: 0, total: 0 });
      e.total++;
      total++;
      if (ch.pass) {
        e.passed++;
        passed++;
      } else if (!misses.includes(r.case)) misses.push(r.case);
    }
  }
  const dropped = done.reduce((n, r) => n + (r.droppedPoints ?? 0), 0);
  const kept = done.reduce((n, r) => n + (r.result ? r.result.strengths.length + r.result.improvements.length : 0), 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    runs: records.length,
    failedRuns: records.length - done.length,
    checksPassed: passed,
    checksTotal: total,
    byCheck,
    wobble: wobble(records),
    casesWithMisses: misses,
    droppedPoints: dropped,
    feedbackPoints: kept + dropped,
    avgMs: avg(done.map(r => r.ms)),
    avgOverall: avg(done.map(r => r.overall ?? 0)),
  };
}

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${Math.round((n / d) * 100)}%`);

/** Per-case lines: each run's failed expectations (or "all met"). */
export function formatCaseReport(c: CaseFile, records: RunRecord[]): string {
  const lines = [`${c.name}  (${c.scenarioId})  ${c.description}`];
  for (const r of records.filter(x => x.case === c.name).sort((a, b) => a.run - b.run)) {
    if (r.error) {
      lines.push(`  run ${r.run}: ERROR ${r.error}`);
      continue;
    }
    const checks = r.checks ?? [];
    const failed = checks.filter(k => !k.pass);
    const scores = r.result ? RUBRIC.map(i => r.result!.rubricScores[i.key]?.score ?? '-').join('') : '';
    const head = `  run ${r.run}: ${checks.length - failed.length}/${checks.length} met, overall ${r.overall}%, scores ${scores}, ${(r.ms / 1000).toFixed(1)}s`;
    lines.push(failed.length ? `${head}\n${failed.map(k => `    MISS ${k.id}: expected ${k.expected}, got ${k.actual}`).join('\n')}` : head);
  }
  return lines.join('\n');
}

/** The one-screen summary printed at the end of a run. */
export function formatSummary(s: Summary, meta: { model: string; promptVersion: string; cases: number; runsPerCase: number }): string {
  const out: string[] = [];
  out.push(`Debrief evaluation: model ${meta.model}, prompt ${meta.promptVersion}, ${meta.cases} cases x ${meta.runsPerCase} runs (${s.runs} assessments, ${s.failedRuns} failed)`);
  out.push('');
  out.push('Item            agreement with expectations   runs disagreeing with each other');
  for (const r of RUBRIC) {
    const c = s.byCheck[r.key];
    const w = s.wobble.find(x => x.item === r.key)!;
    out.push(`${r.key.padEnd(15)} ${(c ? `${c.passed}/${c.total} ${pct(c.passed, c.total)}` : 'n/a').padEnd(29)} ${w.cases ? `${w.disagreeing}/${w.cases} cases ${pct(w.disagreeing, w.cases)}` : 'n/a'}`);
  }
  for (const id of ['outcomeCorrect', 'unsafeOutcome', 'redFlagHandled']) {
    const c = s.byCheck[id];
    if (c) out.push(`${id.padEnd(15)} ${`${c.passed}/${c.total} ${pct(c.passed, c.total)}`.padEnd(29)} -`);
  }
  out.push('');
  out.push(`All expectations met: ${s.checksPassed}/${s.checksTotal} (${pct(s.checksPassed, s.checksTotal)})`);
  out.push(`Feedback points dropped (quote not in transcript): ${s.droppedPoints} of ${s.feedbackPoints}`);
  out.push(`Average time per debrief: ${(s.avgMs / 1000).toFixed(1)}s; average overall score ${Math.round(s.avgOverall)}%`);
  if (s.casesWithMisses.length) out.push(`Cases with a missed expectation in some run: ${s.casesWithMisses.join(', ')}`);
  return out.join('\n');
}

export type Args = { runs: number; concurrency: number; caseName?: string; jsonPath?: string; rescorePath?: string };

export function parseArgs(argv: string[]): Args {
  const args: Args = { runs: 3, concurrency: 4 };
  const num = (flag: string, v: string | undefined) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} needs a whole number of at least 1`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--runs') {
      args.runs = num(a, v);
      i++;
    } else if (a === '--concurrency') {
      args.concurrency = num(a, v);
      i++;
    } else if (a === '--case') {
      if (!v) throw new Error('--case needs a case name');
      args.caseName = v;
      i++;
    } else if (a === '--json') {
      if (!v) throw new Error('--json needs a file path');
      args.jsonPath = v;
      i++;
    } else if (a === '--rescore') {
      if (!v) throw new Error('--rescore needs a file path');
      args.rescorePath = v;
      i++;
    } else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

/** Checks a case file read from disk is shaped as expected, so a typo fails loudly before any money is spent. */
export function validateCase(raw: unknown, file: string, scenarioHasRedFlag: (id: string) => boolean | undefined): CaseFile {
  const c = raw as CaseFile;
  const bad = (m: string): never => {
    throw new Error(`${file}: ${m}`);
  };
  if (!c || typeof c !== 'object') return bad('not an object');
  if (typeof c.name !== 'string' || !c.name) bad('missing name');
  if (typeof c.description !== 'string' || !c.description) bad('missing description');
  const red = scenarioHasRedFlag(c.scenarioId);
  if (red === undefined) bad(`unknown scenario ${c.scenarioId}`);
  if (!Array.isArray(c.transcript) || c.transcript.length === 0) bad('empty transcript');
  for (const t of c.transcript) if ((t.speaker !== 'trainee' && t.speaker !== 'patient') || typeof t.text !== 'string' || !t.text) bad('bad transcript line');
  if (!c.expect?.scores || typeof c.expect.flagsReason !== 'string') bad('missing expect.scores or expect.flagsReason');
  for (const r of RUBRIC) {
    const e = c.expect.scores[r.key];
    if (e === undefined) bad(`missing expectation for ${r.key}`);
    if (e === null) {
      if (r.key !== 'redFlag' || red) bad(`${r.key} may be null only for a scenario without a red flag`);
      continue;
    }
    if (r.key === 'redFlag' && !red) bad('redFlag must be null for a scenario without a red flag');
    if (typeof e.reason !== 'string' || !e.reason) bad(`${r.key} has no reason`);
    const lo = 'score' in e ? e.score : e.min;
    const hi = 'score' in e ? e.score : e.max;
    if (![lo, hi].every(n => Number.isInteger(n) && n >= 0 && n <= 2) || lo > hi) bad(`${r.key} has a bad score or range`);
  }
  if (!red && c.expect.redFlagHandled !== null) bad('redFlagHandled must be null for a scenario without a red flag');
  if (red && c.expect.redFlagHandled === null) bad('redFlagHandled must not be null for a scenario with a red flag (leave it out to skip the check)');
  return c;
}
