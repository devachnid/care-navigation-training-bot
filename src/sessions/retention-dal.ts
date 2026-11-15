import { sql } from 'drizzle-orm';
import { getDb, queryRows } from '@/db/client';
import { audit } from '@/audit/log';

/** Calls whose debrief has finished (or never will): only these can lose their transcript. */
const FINISHED = sql`('complete', 'too_short', 'failed')`;
const CHUNK = 200;

/**
 * Deletes the transcripts of calls that ended more than the practice's retention period ago.
 * This is a system job (run by the daily cron route), not an actor's action, so it takes no
 * actor and is not used by pages or server actions.
 *
 * For each practice with `transcript_retention_days` set, and each of its finished calls that ended
 * more than that many days before `now` and is not yet marked: delete the transcript turns, empty
 * the quoted text of the debrief (strengths, improvements and quoted moments; scores, outcome flags
 * and rubric scores with their reasons stay), delete the reports of problems with that debrief, and
 * lastly set `transcript_deleted_at`. The mark goes last, so a failure part-way leaves the call
 * unmarked and the next run does every step again; each step is safe to repeat. Calls still in
 * progress, calls with no practice, and practices that keep transcripts are never touched.
 * One audit entry per practice affected.
 */
export async function deleteExpiredTranscripts(now = new Date()): Promise<{ sessions: number }> {
  const due = await queryRows<{ id: string; practice_id: string; days: number }>(sql`
    select s.id, s.practice_id, p.transcript_retention_days as days
    from sessions s
    join practices p on p.id = s.practice_id
    where p.transcript_retention_days is not null
      and s.status in ${FINISHED}
      and s.ended_at is not null
      and s.transcript_deleted_at is null
      and s.ended_at < ${now.toISOString()}::timestamptz - (p.transcript_retention_days * interval '1 day')
  `);

  const byPractice = new Map<string, { days: number; ids: string[] }>();
  for (const r of due) {
    const entry = byPractice.get(r.practice_id) ?? { days: r.days, ids: [] };
    entry.ids.push(r.id);
    byPractice.set(r.practice_id, entry);
  }

  const db = getDb();
  let total = 0;
  for (const [practiceId, { days, ids }] of byPractice) {
    let marked = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      // The ids are fixed up front, so a retention change part-way cannot mark a call that was not cleared.
      const chunk = ids.slice(i, i + CHUNK);
      const list = sql.join(
        chunk.map(id => sql`${id}::uuid`),
        sql`, `,
      );
      await db.execute(sql`delete from transcript_turns where session_id in (${list})`);
      await db.execute(sql`
        update debriefs set strengths = '[]'::jsonb, improvements = '[]'::jsonb, quoted_moments = '[]'::jsonb
        where session_id in (${list})
      `);
      await db.execute(sql`delete from debrief_flags where session_id in (${list})`);
      const rows = await queryRows<{ id: string }>(sql`
        update sessions set transcript_deleted_at = ${now.toISOString()}::timestamptz
        where id in (${list}) and transcript_deleted_at is null
        returning id
      `);
      marked += rows.length;
    }
    if (marked > 0) {
      await audit(null, 'transcripts.expired', { type: 'practice', id: practiceId, practiceId }, { sessions: marked, retentionDays: days });
      total += marked;
    }
  }
  return { sessions: total };
}
