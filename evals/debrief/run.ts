/**
 * Debrief evaluation runner. Costs real money (about 1p per assessment); never run by `npm test` or CI.
 *
 *   NODE_USE_ENV_PROXY=1 npm run eval:debrief -- [--runs 3] [--case <name>] [--json <file>] [--concurrency 4]
 *
 * Reads AI_GATEWAY_API_KEY and DEBRIEF_MODEL from .env.local. See docs/engineering/debrief-quality.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { assessTranscript } from '../../src/debrief/assess';
import { PROMPT_VERSION } from '../../src/debrief/prompt';
import { scenarios } from '../../src/scenarios/seed';
import { formatCaseReport, formatSummary, parseArgs, recordFromResult, rescore, summarise, validateCase, type CaseFile, type RunRecord } from './lib';

const casesDir = path.join(import.meta.dirname, 'cases');

function loadCases(only?: string): CaseFile[] {
  const files = fs.readdirSync(casesDir).filter(f => f.endsWith('.json')).sort();
  const cases = files.map(f =>
    validateCase(JSON.parse(fs.readFileSync(path.join(casesDir, f), 'utf8')), f, id => {
        const sc = scenarios.find(x => x.id === id);
        return sc ? sc.redFlags.length > 0 : undefined;
      }),
  );
  if (!only) return cases;
  const picked = cases.filter(c => c.name === only);
  if (picked.length === 0) throw new Error(`No case named ${only}. Cases: ${cases.map(c => c.name).join(', ')}`);
  return picked;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

async function main() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Keys may already be in the environment.
  }
  const args = parseArgs(process.argv.slice(2));
  const modelId = process.env.DEBRIEF_MODEL;
  if (!modelId) throw new Error('DEBRIEF_MODEL is not set (put it in .env.local)');
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error('AI_GATEWAY_API_KEY is not set (put it in .env.local)');

  const cases = loadCases(args.caseName);

  if (args.rescorePath) {
    // No model calls: read an earlier --json file against the current case files.
    const saved = JSON.parse(fs.readFileSync(args.rescorePath, 'utf8')) as { model: string; promptVersion: string; runsPerCase: number; records: RunRecord[] };
    const records = rescore(saved.records.filter(r => cases.some(c => c.name === r.case)), cases);
    for (const c of cases) console.log(formatCaseReport(c, records) + '\n');
    console.log(formatSummary(summarise(records), { model: saved.model, promptVersion: saved.promptVersion, cases: cases.length, runsPerCase: saved.runsPerCase }));
    return;
  }

  const jobs = cases.flatMap(c => Array.from({ length: args.runs }, (_, i) => ({ c, run: i + 1 })));
  console.log(`Running ${jobs.length} assessments (${cases.length} cases x ${args.runs}) on ${modelId}, ${args.concurrency} at a time...`);

  const records: RunRecord[] = [];
  await pool(jobs, args.concurrency, async ({ c, run }) => {
    const scenario = scenarios.find(s => s.id === c.scenarioId)!;
    const started = Date.now();
    try {
      const { result, droppedPoints } = await assessTranscript(scenario, c.transcript, modelId);
      records.push(recordFromResult(c, run, Date.now() - started, result, droppedPoints));
    } catch (err) {
      records.push({ case: c.name, scenarioId: c.scenarioId, run, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) });
    }
    process.stdout.write('.');
  });
  console.log('\n');

  for (const c of cases) console.log(formatCaseReport(c, records) + '\n');
  console.log(formatSummary(summarise(records), { model: modelId, promptVersion: PROMPT_VERSION, cases: cases.length, runsPerCase: args.runs }));

  if (args.jsonPath) {
    const sorted = [...records].sort((a, b) => a.case.localeCompare(b.case) || a.run - b.run);
    fs.writeFileSync(args.jsonPath, JSON.stringify({ model: modelId, promptVersion: PROMPT_VERSION, runsPerCase: args.runs, at: new Date().toISOString(), records: sorted }, null, 2));
    console.log(`\nRaw results written to ${args.jsonPath}`);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
