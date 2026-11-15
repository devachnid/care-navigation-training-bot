import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { debriefs, practiceScenarios, sessions } from '@/db/schema';
import type { Actor, MemberActor } from '@/policy/actor';
import { ForbiddenError } from '@/policy/result';
import { approveScenario, listScenariosForManagement } from '@/scenarios/practice-dal';
import { endCall, saveDebrief, startCall, type DebriefValues } from '@/sessions/dal';
import { createTestDb } from '@/test/db';
import { addMember, deactivate, makePractice, seedLibrary } from '@/test/fixtures';
import { getScenarioBreakdown, getStaffMatrix, getSummary, listExportRows, listRecentUnsafe } from './dal';
import type { Period } from './period';

const NOW = new Date('2026-11-15T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const SCORES = {
  greeting: { score: 2, justification: 'ok' },
  information: { score: 1, justification: 'ok' },
  redFlag: null,
  destination: { score: 1, justification: 'ok' },
  role: { score: 2, justification: 'ok' },
  explanation: { score: 0, justification: 'ok' },
  manner: { score: 1, justification: 'ok' },
};

type Kind = {
  score: number;
  correct?: boolean;
  unsafe?: boolean;
  tooShort?: boolean;
};

async function call(actor: Actor, scenarioId: string, startedAt: Date, kind: Kind): Promise<string> {
  const started = await startCall(actor, scenarioId, startedAt);
  if (!started.ok) throw new Error(started.error);
  const turns = kind.tooShort
    ? [{ speaker: 'patient' as const, text: 'Hello?' }]
    : [
        { speaker: 'patient' as const, text: 'Hello.' },
        { speaker: 'trainee' as const, text: 'Good morning, how can I help?' },
      ];
  await endCall(actor, started.sessionId, {
    durationSeconds: kind.tooShort ? 5 : 120,
    turns,
  });
  if (!kind.tooShort) {
    const values: DebriefValues = {
      overallScore: kind.score,
      outcomeCorrect: kind.correct ?? false,
      unsafeOutcome: kind.unsafe ?? false,
      redFlagHandled: kind.unsafe ? false : null,
      rubricScores: SCORES,
      strengths: [],
      improvements: [],
      quotedMoments: [],
      modelUsed: 'test',
      promptVersion: 'test',
    };
    await saveDebrief(actor, started.sessionId, values);
  }
  return started.sessionId;
}

const PASS = (score: number): Kind => ({ score, correct: true });
const NOT_YET = (score: number): Kind => ({ score, correct: false });
const UNSAFE = (score: number): Kind => ({
  score,
  correct: false,
  unsafe: true,
});

async function practice(name: string) {
  const p = await makePractice(name);
  const approver = await addMember(p.practiceId, 'trainee', true, 'Approver');
  const all = await listScenariosForManagement(p.manager.actor);
  const pick = async (lib: string) => {
    const s = all.find(x => x.libraryScenarioId === lib)!;
    await approveScenario(approver.actor, s.id, 1);
    return s;
  };
  const [s1, s2, s3] = [
    await pick('angina-repeat'),
    await pick('sore-throat'),
    await pick(all.map(x => x.libraryScenarioId).find(l => l && !['angina-repeat', 'sore-throat'].includes(l))!),
  ];
  return {
    ...p,
    manager: p.manager as { actor: MemberActor },
    approver,
    s1,
    s2,
    s3,
  };
}

type World = Awaited<ReturnType<typeof buildWorld>>;
let w: World;
let other: Awaited<ReturnType<typeof practice>>;

async function buildWorld() {
  const p = await practice('Reports Surgery');
  const ann = await addMember(p.practiceId, 'trainee', false, 'Ann Adams');
  const ben = await addMember(p.practiceId, 'trainee', false, 'Ben Brown');
  const cat = await addMember(p.practiceId, 'trainee', false, 'Cat Clarke'); // deactivated after calls
  const dan = await addMember(p.practiceId, 'trainee', false, 'Dan Never'); // never called
  const ids: Record<string, string> = {};
  const a = ann.actor;
  ids.a1 = await call(a, p.s1.id, daysAgo(20), NOT_YET(40));
  ids.a2 = await call(a, p.s1.id, daysAgo(10), PASS(90));
  ids.a3 = await call(a, p.s2.id, daysAgo(5), UNSAFE(20));
  ids.a4 = await call(a, p.s3.id, daysAgo(3), { score: 0, tooShort: true });
  ids.a5 = await call(a, p.s1.id, daysAgo(60), PASS(100)); // 90 days and all time only
  ids.a6 = await call(a, p.s2.id, daysAgo(120), NOT_YET(10)); // all time only
  ids.b1 = await call(ben.actor, p.s1.id, daysAgo(2), PASS(70));
  ids.c1 = await call(cat.actor, p.s2.id, daysAgo(15), PASS(80));
  ids.c2 = await call(cat.actor, p.s2.id, daysAgo(40), UNSAFE(30));
  await deactivate(p.practiceId, cat.user.id);
  return { ...p, ann, ben, cat, dan, ids };
}

beforeAll(async () => {
  await createTestDb();
  await seedLibrary();
  w = await buildWorld();
  other = await practice('Other Surgery');
  const stranger = await addMember(other.practiceId, 'trainee', false, 'Stranger Danger');
  await call(stranger.actor, other.s1.id, daysAgo(1), UNSAFE(5));
  await call(stranger.actor, other.s1.id, daysAgo(2), PASS(95));
  // A PoC row: no practice, no user, but with a debrief. It must never be counted.
  const [legacy] = await getDb()
    .insert(sessions)
    .values({
      traineeName: 'Legacy Larry',
      status: 'complete',
      startedAt: daysAgo(1),
    })
    .returning();
  await getDb().insert(debriefs).values({
    sessionId: legacy.id,
    overallScore: 99,
    outcomeCorrect: true,
    unsafeOutcome: true,
    rubricScores: SCORES,
    strengths: [],
    improvements: [],
    quotedMoments: [],
    modelUsed: 'poc',
  });
});

describe('getSummary', () => {
  it('30 days: counts assessed calls, staff who practised, average and unsafe', async () => {
    // In the window: a1 40, a2 90, a3 20 (unsafe), a4 0 (too short), b1 70, c1 80 (deactivated) = 6 calls.
    expect(await getSummary(w.manager.actor, '30d', NOW)).toEqual({
      calls: 6,
      staffPractised: 2, // Ann and Ben; Cat's place is deactivated
      totalStaff: 5, // manager, approver, Ann, Ben, Dan (not Cat)
      averageScore: 50, // 300 / 6
      unsafe: 1,
    });
  });

  it('90 days adds calls 60 and 40 days old; all time adds the 120-day-old one', async () => {
    expect(await getSummary(w.manager.actor, '90d', NOW)).toMatchObject({
      calls: 8,
      unsafe: 2,
      averageScore: 54,
    }); // 430 / 8
    expect(await getSummary(w.manager.actor, 'all', NOW)).toMatchObject({
      calls: 9,
      unsafe: 2,
      averageScore: 49,
    }); // 440 / 9
  });

  it('includes a deactivated person in the totals but not in staff who practised', async () => {
    const s = await getSummary(w.manager.actor, '30d', NOW);
    expect(s.calls).toBe(6);
    expect(s.staffPractised).toBe(2);
  });

  it('counts a too-short call as an assessed call scoring 0', async () => {
    const [short] = await getDb().select().from(debriefs).where(eq(debriefs.sessionId, w.ids.a4));
    expect(short).toMatchObject({ overallScore: 0, rubricScores: null });
    const s = await getSummary(w.manager.actor, '30d', NOW);
    expect(s.calls).toBe(6);
  });

  it('includes a call exactly at the start of the period and leaves out one a second earlier', async () => {
    const edge = await practice('Edge Surgery');
    const person = await addMember(edge.practiceId, 'trainee', false, 'Edgar');
    await call(person.actor, edge.s1.id, new Date(NOW.getTime() - 30 * DAY), PASS(60));
    await call(person.actor, edge.s2.id, new Date(NOW.getTime() - 30 * DAY - 1000), PASS(60));
    expect((await getSummary(edge.manager.actor, '30d', NOW)).calls).toBe(1);
    expect((await getSummary(edge.manager.actor, '90d', NOW)).calls).toBe(2);
  });

  it('does not count a call that has no debrief yet', async () => {
    const pending = await practice('Pending Surgery');
    const person = await addMember(pending.practiceId, 'trainee', false, 'Pat');
    const started = await startCall(person.actor, pending.s1.id, daysAgo(1));
    expect(started.ok).toBe(true);
    expect(await getSummary(pending.manager.actor, 'all', NOW)).toMatchObject({
      calls: 0,
      staffPractised: 0,
      averageScore: null,
      unsafe: 0,
    });
  });

  it('never includes legacy rows or another practice', async () => {
    expect((await getSummary(w.manager.actor, 'all', NOW)).calls).toBe(9);
    expect(await getSummary(other.manager.actor, 'all', NOW)).toMatchObject({
      calls: 2,
      unsafe: 1,
      staffPractised: 1,
      averageScore: 50,
    });
  });
});

describe('getStaffMatrix', () => {
  it('lists active staff by name, never a deactivated person, with a column per active scenario', async () => {
    const m = await getStaffMatrix(w.manager.actor, '30d', NOW);
    expect(m.staff.map(s => s.name)).toEqual(['Ann Adams', 'Approver', 'Ben Brown', 'Dan Never', 'manager person']);
    // Every library scenario is copied into a practice as active, so there may be more columns than we called on.
    expect(m.scenarios.map(s => s.id)).toEqual(expect.arrayContaining([w.s1.id, w.s2.id, w.s3.id]));
  });

  it('shows the latest result, the best score and a link to the latest call', async () => {
    const m = await getStaffMatrix(w.manager.actor, '30d', NOW);
    const ann = m.staff.find(s => s.name === 'Ann Adams')!;
    // Ann: NOT_YET 40 twenty days ago, then PASS 90 ten days ago.
    expect(ann.cells[w.s1.id]).toEqual({
      result: 'passed',
      bestScore: 90,
      attempts: 2,
      sessionId: w.ids.a2,
    });
    expect(ann.cells[w.s2.id]).toMatchObject({
      result: 'unsafe',
      bestScore: 20,
      sessionId: w.ids.a3,
    });
    expect(ann.cells[w.s3.id]).toMatchObject({
      result: 'not_yet',
      bestScore: 0,
      sessionId: w.ids.a4,
    }); // too short
  });

  it('follows the latest call, not the best one, and respects the period', async () => {
    const all = await getStaffMatrix(w.manager.actor, 'all', NOW);
    const ann = all.staff.find(s => s.name === 'Ann Adams')!;
    // Ten days ago is still her latest on scenario 1, but the best score now includes the 100.
    expect(ann.cells[w.s1.id]).toMatchObject({
      result: 'passed',
      bestScore: 100,
      attempts: 3,
      sessionId: w.ids.a2,
    });
    expect(ann.cells[w.s2.id]).toMatchObject({ result: 'unsafe', attempts: 2 });
    const thirty = await getStaffMatrix(w.manager.actor, '30d', NOW);
    expect(thirty.staff.find(s => s.name === 'Ann Adams')!.cells[w.s1.id].attempts).toBe(2);
  });

  it('lists a person who has never called, with no cells, and leaves out a deactivated person', async () => {
    const m = await getStaffMatrix(w.manager.actor, 'all', NOW);
    expect(m.staff.find(s => s.name === 'Dan Never')!.cells).toEqual({});
    expect(m.staff.some(s => s.name === 'Cat Clarke')).toBe(false);
    expect(m.staff.find(s => s.name === 'Ben Brown')!.cells[w.s1.id]).toMatchObject({ result: 'passed', bestScore: 70 });
  });

  it('has no column for a hidden scenario and no cell for it', async () => {
    const p = await practice('Hidden Surgery');
    const person = await addMember(p.practiceId, 'trainee', false, 'Hilda');
    await call(person.actor, p.s1.id, daysAgo(1), PASS(80));
    await getDb().update(practiceScenarios).set({ active: false }).where(eq(practiceScenarios.id, p.s1.id));
    const m = await getStaffMatrix(p.manager.actor, '30d', NOW);
    expect(m.scenarios.some(s => s.id === p.s1.id)).toBe(false);
    expect(m.staff.find(s => s.name === 'Hilda')!.cells[p.s1.id]).toBeUndefined();
    expect((await getSummary(p.manager.actor, '30d', NOW)).calls).toBe(1);
  });

  it('never includes another practice, its people or its scenarios', async () => {
    const m = await getStaffMatrix(w.manager.actor, 'all', NOW);
    expect(m.staff.some(s => s.name === 'Stranger Danger')).toBe(false);
    expect(m.scenarios.some(s => s.id === other.s1.id)).toBe(false);
    const theirs = await getStaffMatrix(other.manager.actor, 'all', NOW);
    expect(theirs.staff.map(s => s.name)).not.toContain('Ann Adams');
    expect(theirs.staff.find(s => s.name === 'Stranger Danger')!.cells[other.s1.id]).toMatchObject({
      result: 'unsafe',
      bestScore: 95,
      attempts: 2,
    }); // latest was the unsafe one
    for (const s of theirs.staff) expect(Object.keys(s.cells).every(k => k !== w.s1.id)).toBe(true);
  });
});

describe('getScenarioBreakdown', () => {
  it('counts attempts, people, pass rate, average score and unsafe per scenario', async () => {
    const rows = await getScenarioBreakdown(w.manager.actor, 'all', NOW);
    const byId = new Map(rows.map(r => [r.practiceScenarioId, r]));
    // s1: a1 40, a2 90, a5 100, b1 70 -> 4 attempts, Ann and Ben, 3 passed.
    expect(byId.get(w.s1.id)).toMatchObject({
      attempts: 4,
      people: 2,
      passed: 3,
      passRate: 75,
      averageScore: 75,
      unsafe: 0,
    });
    // s2: a3 20 unsafe, a6 10, c1 80 pass, c2 30 unsafe -> 4 attempts, Ann and Cat, 1 passed.
    expect(byId.get(w.s2.id)).toMatchObject({
      attempts: 4,
      people: 2,
      passed: 1,
      passRate: 25,
      averageScore: 35,
      unsafe: 2,
    });
    expect(byId.get(w.s3.id)).toMatchObject({
      attempts: 1,
      people: 1,
      passed: 0,
      passRate: 0,
      averageScore: 0,
      unsafe: 0,
    });
    expect(rows.map(r => r.attempts)).toEqual([4, 4, 1]);
  });

  it('respects the period', async () => {
    const rows = await getScenarioBreakdown(w.manager.actor, '30d', NOW);
    expect(rows.find(r => r.practiceScenarioId === w.s1.id)).toMatchObject({
      attempts: 3,
      passed: 2,
    });
    expect(rows.find(r => r.practiceScenarioId === w.s2.id)).toMatchObject({
      attempts: 2,
      people: 2,
    });
  });

  it('still reports a scenario that was edited or hidden under the title it had', async () => {
    const p = await practice('Edited Surgery');
    const person = await addMember(p.practiceId, 'trainee', false, 'Edie');
    await call(person.actor, p.s1.id, daysAgo(2), PASS(80));
    const [before] = await getDb()
      .select({
        title: practiceScenarios.title,
        difficulty: practiceScenarios.difficulty,
      })
      .from(practiceScenarios)
      .where(eq(practiceScenarios.id, p.s1.id));
    await getDb()
      .update(practiceScenarios)
      .set({
        title: 'Renamed completely',
        difficulty: before.difficulty === 'hard' ? 'easy' : 'hard',
        revision: 2,
        active: false,
      })
      .where(eq(practiceScenarios.id, p.s1.id));
    const [row] = await getScenarioBreakdown(p.manager.actor, '30d', NOW);
    expect(row.title).toBe(before.title);
    expect(row.difficulty).toBe(before.difficulty);
    expect(row.title).not.toBe('Renamed completely');
    const unsafeList = await listExportRows(p.manager.actor, '30d', NOW);
    expect(unsafeList[0].title).toBe(before.title);
  });

  it('never includes legacy rows or another practice', async () => {
    const mine = await getScenarioBreakdown(w.manager.actor, 'all', NOW);
    expect(mine.reduce((n, r) => n + r.attempts, 0)).toBe(9);
    expect(mine.some(r => r.practiceScenarioId === other.s1.id)).toBe(false);
    const theirs = await getScenarioBreakdown(other.manager.actor, 'all', NOW);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({
      practiceScenarioId: other.s1.id,
      attempts: 2,
      people: 1,
      unsafe: 1,
    });
  });
});

describe('listRecentUnsafe', () => {
  it('lists unsafe calls newest first with who and which scenario, including a deactivated person', async () => {
    const rows = await listRecentUnsafe(w.manager.actor, 'all', NOW);
    expect(rows.map(r => r.sessionId)).toEqual([w.ids.a3, w.ids.c2]);
    expect(rows[0]).toMatchObject({
      userName: 'Ann Adams',
      startedAt: daysAgo(5),
    });
    expect(rows[1]).toMatchObject({ userName: 'Cat Clarke' });
    expect(typeof rows[0].title).toBe('string');
    expect(rows[0].title.length).toBeGreaterThan(0);
  });

  it('respects the period', async () => {
    expect((await listRecentUnsafe(w.manager.actor, '30d', NOW)).map(r => r.sessionId)).toEqual([w.ids.a3]);
    expect(await listRecentUnsafe(w.manager.actor, '90d', NOW)).toHaveLength(2);
  });

  it('keeps only the 20 most recent', async () => {
    const p = await practice('Unsafe Surgery');
    const person = await addMember(p.practiceId, 'trainee', false, 'Una');
    const ids: string[] = [];
    for (let day = 25; day >= 1; day--) ids.push(await call(person.actor, p.s1.id, daysAgo(day), UNSAFE(10)));
    const rows = await listRecentUnsafe(p.manager.actor, '30d', NOW);
    expect(rows).toHaveLength(20);
    expect(rows.map(r => r.sessionId)).toEqual(ids.slice(5).reverse());
  });

  it('never includes legacy rows or another practice', async () => {
    const mine = await listRecentUnsafe(w.manager.actor, 'all', NOW);
    expect(mine.some(r => r.userName === 'Stranger Danger' || r.userName === 'Legacy Larry')).toBe(false);
    const theirs = await listRecentUnsafe(other.manager.actor, 'all', NOW);
    expect(theirs.map(r => r.userName)).toEqual(['Stranger Danger']);
  });
});

describe('listExportRows', () => {
  it('lists every assessed call in the period, oldest first, with the fields the CSV needs', async () => {
    const rows = await listExportRows(w.manager.actor, 'all', NOW);
    expect(rows.map(r => r.sessionId)).toEqual(
      [w.ids.a6, w.ids.a5, w.ids.c2, w.ids.c1, w.ids.a1, w.ids.a2, w.ids.a3, w.ids.a4, w.ids.b1].sort((x, y) => order(x) - order(y)),
    );
    const a4 = rows.find(r => r.sessionId === w.ids.a4)!;
    expect(a4).toMatchObject({
      name: 'Ann Adams',
      status: 'too_short',
      score: 0,
      rubricScores: null,
      redFlagHandled: null,
      unsafeOutcome: false,
      outcomeCorrect: false,
    });
    const a3 = rows.find(r => r.sessionId === w.ids.a3)!;
    expect(a3).toMatchObject({
      status: 'complete',
      score: 20,
      unsafeOutcome: true,
      redFlagHandled: false,
      durationSeconds: 120,
    });
    expect(a3.rubricScores?.greeting.score).toBe(2);
    expect(a3.email).toMatch(/@example\.com$/);
    expect(typeof a3.approved).toBe('boolean');
  });

  it('has the right number of rows for each period', async () => {
    const counts = await Promise.all(
      (['30d', '90d', 'all'] as Period[]).map(async p => (await listExportRows(w.manager.actor, p, NOW)).length),
    );
    expect(counts).toEqual([6, 8, 9]);
  });

  it('is in start order', async () => {
    const rows = await listExportRows(w.manager.actor, 'all', NOW);
    const times = rows.map(r => r.startedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('never includes legacy rows or another practice', async () => {
    const mine = await listExportRows(w.manager.actor, 'all', NOW);
    expect(mine.some(r => r.name === 'Stranger Danger' || r.email === '')).toBe(false);
    expect(mine).toHaveLength(9);
    const theirs = await listExportRows(other.manager.actor, 'all', NOW);
    expect(theirs.map(r => r.name)).toEqual(['Stranger Danger', 'Stranger Danger']);
  });
});

describe('who may ask', () => {
  it('refuses a trainee, whatever the function', async () => {
    const trainee = w.ann.actor as MemberActor;
    for (const fn of [getSummary, getStaffMatrix, getScenarioBreakdown, listRecentUnsafe, listExportRows]) {
      await expect(fn(trainee, '30d', NOW)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});

/** Position of a session in the start order, to compare against the DAL's order. */
function order(id: string): number {
  const keys = Object.values(w.ids);
  const starts: Record<string, number> = {
    a6: 120,
    a5: 60,
    c2: 40,
    a1: 20,
    c1: 15,
    a2: 10,
    a3: 5,
    a4: 3,
    b1: 2,
  };
  const key = Object.entries(w.ids).find(([, v]) => v === id)![0];
  void keys;
  return -starts[key];
}
