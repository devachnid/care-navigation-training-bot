import { safeEqual } from '@/auth/safe-equal';
import { deleteExpiredTranscripts } from '@/sessions/retention-dal';

// Deleting a lot of old calls at once can take a while.
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Daily job (see vercel.json): deletes transcripts older than each practice's retention period.
 * Vercel calls this path with `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set in the
 * project. Not a signed-in route: the secret is the only way in.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 20) {
    return Response.json({ error: 'The retention job is not set up.' }, { status: 503, headers: NO_STORE });
  }
  const sent = request.headers.get('authorization') ?? '';
  if (!safeEqual(sent, `Bearer ${secret}`)) {
    return Response.json({ error: 'Unauthorised' }, { status: 401, headers: NO_STORE });
  }
  try {
    const result = await deleteExpiredTranscripts();
    return Response.json(result, { headers: NO_STORE });
  } catch (err) {
    console.error('Transcript retention job failed', err);
    return Response.json({ error: 'The retention job failed.' }, { status: 500, headers: NO_STORE });
  }
}
