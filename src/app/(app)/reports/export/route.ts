import { getActor } from '@/auth/current';
import type { MemberActor } from '@/policy/actor';
import { can } from '@/policy/can';
import { listExportRows } from '@/reports/dal';
import { exportCsv, exportFilename } from '@/reports/export';
import { parsePeriod } from '@/reports/period';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** The CSV download of every assessed call in the period. Managers only. */
export async function GET(request: Request) {
  // Not requireAbility(): a route handler answers with a status instead of redirecting or rendering a page.
  const actor = await getActor();
  if (!actor) return Response.json({ error: 'Not signed in' }, { status: 401, headers: NO_STORE });
  if (!can(actor, 'reports.view')) return Response.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  const member = actor as MemberActor;

  const period = parsePeriod(new URL(request.url).searchParams.getAll('period'));
  const rows = await listExportRows(member, period);
  return new Response(exportCsv(rows), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(member.membership.practiceName, new Date())}"`,
    },
  });
}
